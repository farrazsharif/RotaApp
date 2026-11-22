import { prisma } from './prisma';
import { isMedDueOn } from './medSchedule';
import { ownerShiftIdForDose } from './doseOwnership';
import { awayWindows, awayTypeAt } from './awayDoses';

/**
 * Filling the blanks a change of method left behind.
 *
 * Caremid did not always require a carer to clock out, and before it did,
 * doses were given on visits that nobody recorded electronically. Those slots
 * are blank on the MAR - not missed, not refused, simply unrecorded - and a
 * blank reads to anyone looking at the chart as though nothing happened.
 *
 * What makes this defensible is that it writes nothing it cannot point at.
 * A dose is only filled in where the visit that owned it EXISTS, was not
 * cancelled, was one that administers medication, and was ACTUALLY ATTENDED -
 * a clock-in against that visit, by a named carer. That is the evidence, and
 * where it is absent the slot stays blank.
 *
 * And every row it creates says what it is. Each carries a note naming the
 * backfill, its date and its reason, so a reader can see at a glance that
 * this was entered by the office afterwards from the attendance record rather
 * than signed by the carer at the time. A retrospective entry that announces
 * itself is a normal part of a medication record. One that pretends to be
 * contemporaneous is not, which is the whole reason for the note.
 */

export interface BackfillOptions {
  from: Date;              // inclusive, start of day
  to: Date;                // inclusive, end of day
  serviceUserId?: string;
  reason: string;          // goes on every row, so a reader knows why
  apply: boolean;
  limit: number;           // most rows to create in one call
}

export interface BackfillSkips {
  noVisit: number;         // nothing on the rota owned this dose
  visitCancelled: number;
  visitNoMeds: number;     // a personal-care-only call
  notAttended: number;     // on the rota, but nobody clocked in
  away: number;            // in hospital or on respite
  alreadyRecorded: number;
}

export interface BackfillResult {
  fillable: { medicationId: string; serviceUserId: string; scheduledFor: Date; carerId: string | null }[];
  byMonth: Record<string, number>;
  byClient: Record<string, number>;
  skips: BackfillSkips;
  dueTotal: number;
  capped: boolean;
}

const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

export async function planBackfill(opts: BackfillOptions): Promise<BackfillResult> {
  const where = opts.serviceUserId ? { serviceUserId: opts.serviceUserId } : {};

  const [meds, shifts, clocks, existing] = await Promise.all([
    prisma.medication.findMany({
      where: { ...where },
      select: {
        id: true, serviceUserId: true, times: true, daysOfWeek: true, intervalDays: true,
        startDate: true, endDate: true, createdAt: true,
      },
    }),
    prisma.shift.findMany({
      where: { ...where, serviceUserId: { not: null }, date: { gte: opts.from, lte: opts.to } },
      select: { id: true, serviceUserId: true, date: true, startTime: true, endTime: true, status: true, givesMedication: true, userId: true },
    }),
    prisma.clockRecord.findMany({
      where: { clockIn: { gte: opts.from, lte: new Date(opts.to.getTime() + 36e5 * 36) } },
      select: { shiftId: true, userId: true },
    }),
    prisma.medAdministration.findMany({
      where: { ...where, scheduledFor: { gte: opts.from, lte: opts.to } },
      select: { medicationId: true, scheduledFor: true },
    }),
  ]);

  // Who clocked in on which visit. A visit with no clock-in is a visit we
  // cannot say was attended, and an unattended visit evidences nothing.
  const attendedBy = new Map<string, string>();
  for (const c of clocks) if (c.shiftId && !attendedBy.has(c.shiftId)) attendedBy.set(c.shiftId, c.userId);

  const recorded = new Set(existing.map((e) => `${e.medicationId}__${e.scheduledFor.getTime()}`));

  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = `${s.serviceUserId}__${ymd(s.date)}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s);
  }

  const medsByClient = new Map<string, typeof meds>();
  for (const m of meds) (medsByClient.get(m.serviceUserId) ?? medsByClient.set(m.serviceUserId, []).get(m.serviceUserId)!).push(m);

  const clientIds = [...medsByClient.keys()];
  const away = await awayWindows(clientIds, opts.from, opts.to);

  const out: BackfillResult = {
    fillable: [], byMonth: {}, byClient: {},
    skips: { noVisit: 0, visitCancelled: 0, visitNoMeds: 0, notAttended: 0, away: 0, alreadyRecorded: 0 },
    dueTotal: 0, capped: false,
  };

  for (let d = new Date(opts.from); d <= opts.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayKey = ymd(day);

    for (const [serviceUserId, list] of medsByClient) {
      const dayShifts = byDay.get(`${serviceUserId}__${dayKey}`) ?? [];

      for (const med of list) {
        const startYmd = med.startDate ? med.startDate.toISOString().slice(0, 10) : null;
        const endYmd = med.endDate ? med.endDate.toISOString().slice(0, 10) : null;
        if (startYmd && dayKey < startYmd) continue;
        if (endYmd && dayKey > endYmd) continue;
        if (!isMedDueOn(med, day)) continue;

        let times: string[] = [];
        try { times = JSON.parse(med.times || '[]'); } catch { times = []; }

        for (const t of times) {
          const [h, mi] = t.split(':').map(Number);
          const scheduledFor = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h || 0, mi || 0, 0));
          out.dueTotal += 1;

          if (recorded.has(`${med.id}__${scheduledFor.getTime()}`)) { out.skips.alreadyRecorded += 1; continue; }
          if (awayTypeAt(away, serviceUserId, scheduledFor)) { out.skips.away += 1; continue; }

          // The visit that owned this dose, judged over EVERY visit that day -
          // then checked. Picking only from the eligible ones would quietly
          // move a dose onto a different call than the carer app showed it on.
          const ownerId = ownerShiftIdForDose(dayShifts, t);
          const owner = ownerId ? dayShifts.find((s) => s.id === ownerId) : null;
          if (!owner) { out.skips.noVisit += 1; continue; }
          if (owner.status === 'CANCELLED') { out.skips.visitCancelled += 1; continue; }
          if (owner.givesMedication === false) { out.skips.visitNoMeds += 1; continue; }

          const carerId = attendedBy.get(owner.id);
          if (!carerId) { out.skips.notAttended += 1; continue; }

          if (out.fillable.length >= opts.limit) { out.capped = true; continue; }
          out.fillable.push({ medicationId: med.id, serviceUserId, scheduledFor, carerId });
          const month = dayKey.slice(0, 7);
          out.byMonth[month] = (out.byMonth[month] ?? 0) + 1;
          out.byClient[serviceUserId] = (out.byClient[serviceUserId] ?? 0) + 1;
        }
      }
    }
  }

  return out;
}
