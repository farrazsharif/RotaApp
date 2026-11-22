import { Response } from 'express';
import { clientTime } from '../lib/clientTime';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { MedStatus } from '../constants';
import { relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';
import { ownerShiftIdForDose } from '../lib/doseOwnership';
import { clampIntervalDays, isMedDueOn } from '../lib/medSchedule';
import { planBackfill } from '../lib/marBackfill';
import { awayWindows, awayTypeAt } from '../lib/awayDoses';

// Human-readable status words for audit details (matches the portal labels).
const STATUS_WORD: Record<string, string> = {
  GIVEN: 'Administered', REFUSED: 'Refused', MISSED: 'Missed', NOT_NEEDED: 'Not Required', SELF_ADMIN: 'Self-administered', CANCELLED: 'Cancelled', HOSPITAL: 'In hospital', NOT_AT_HOME: 'Not at home',
};

// "for <patient name>" suffix for a medication audit entry, or undefined.
async function forPatient(serviceUserId: string | null | undefined): Promise<string | undefined> {
  if (!serviceUserId) return undefined;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });
  return su ? `for ${su.firstName} ${su.lastName}` : undefined;
}

function parseTimes(input: unknown): string {
  if (Array.isArray(input)) return JSON.stringify(input.filter((t) => typeof t === 'string'));
  if (typeof input === 'string') {
    // allow comma-separated "08:00, 20:00"
    const arr = input.split(',').map((s) => s.trim()).filter(Boolean);
    return JSON.stringify(arr);
  }
  return '[]';
}

// Weekday schedule → JSON array of unique 0-6 ints (0=Sun). Empty = every day.
function parseDays(input: unknown): string {
  if (!Array.isArray(input)) return '[]';
  const days = [...new Set(input.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  return JSON.stringify(days);
}

const VALID_VIEWS = ['front', 'back'];

function parseApplicationSites(input: unknown): string {
  if (!Array.isArray(input)) return '[]';
  const sites = input
    .filter((p): p is { view: string; x: number; y: number } =>
      !!p && VALID_VIEWS.includes(p.view) && typeof p.x === 'number' && typeof p.y === 'number'
    )
    .map((p) => ({ view: p.view, x: p.x, y: p.y, label: typeof (p as { label?: unknown }).label === 'string' ? (p as { label?: string }).label : undefined }));
  return JSON.stringify(sites);
}

export async function listMedications(req: AuthRequest, res: Response) {
  const { serviceUserId, includeInactive } = req.query;
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  // The MAR chart passes includeInactive=true so discontinued meds still show
  // their history (the weeks they were given) alongside the discontinue date.
  // Everywhere else (eMAR, med lists) keeps showing only active meds.
  const where: Record<string, unknown> = { serviceUserId: String(serviceUserId) };
  if (String(includeInactive) !== 'true') where.active = true;
  const meds = await prisma.medication.findMany({ where, orderBy: { name: 'asc' } });
  res.json(meds);
}

export async function createMedication(req: AuthRequest, res: Response) {
  const { serviceUserId, name, dose, route, instructions, times, daysOfWeek, intervalDays, startDate, endDate, applicationSites, isBlisterPack, packContents } = req.body;
  if (!serviceUserId || !name) return res.status(400).json({ error: 'serviceUserId and name required' });
  const med = await prisma.medication.create({
    data: {
      serviceUserId,
      name,
      dose: dose || null,
      route: route || null,
      instructions: instructions || null,
      isBlisterPack: !!isBlisterPack,
      packContents: packContents ? String(packContents) : null,
      times: parseTimes(times),
      daysOfWeek: parseDays(daysOfWeek),
      intervalDays: clampIntervalDays(intervalDays),
      applicationSites: parseApplicationSites(applicationSites),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  await logAudit(req, 'MEDICATION_ADDED', name, await forPatient(serviceUserId));
  res.status(201).json(med);
}

// Carer-added short-course medication (e.g. a GP prescribes antibiotics for a
// week). Same as createMedication but reachable without manage_medications —
// the scope middleware still confines it to the carer's own clients, and it's
// audited so it's clear a carer added it directly on a visit.
export async function createMedicationByCarer(req: AuthRequest, res: Response) {
  const { serviceUserId, name, dose, route, instructions, times, startDate, endDate } = req.body;
  if (!serviceUserId || !name) return res.status(400).json({ error: 'serviceUserId and name required' });
  const med = await prisma.medication.create({
    data: {
      serviceUserId,
      name,
      dose: dose || null,
      route: route || null,
      instructions: instructions || null,
      times: parseTimes(times),
      applicationSites: '[]',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  await logAudit(req, 'MEDICATION_ADDED_BY_CARER', name, await forPatient(serviceUserId));
  res.status(201).json(med);
}

export async function updateMedication(req: AuthRequest, res: Response) {
  const { name, dose, route, instructions, times, daysOfWeek, intervalDays, startDate, endDate, active, applicationSites, isBlisterPack, packContents } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (dose !== undefined) data.dose = dose || null;
  if (route !== undefined) data.route = route || null;
  if (instructions !== undefined) data.instructions = instructions || null;
  if (isBlisterPack !== undefined) data.isBlisterPack = !!isBlisterPack;
  if (packContents !== undefined) data.packContents = packContents ? String(packContents) : null;
  if (times !== undefined) data.times = parseTimes(times);
  if (daysOfWeek !== undefined) data.daysOfWeek = parseDays(daysOfWeek);
  if (intervalDays !== undefined) data.intervalDays = clampIntervalDays(intervalDays);
  if (applicationSites !== undefined) data.applicationSites = parseApplicationSites(applicationSites);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (active !== undefined) data.active = !!active;
  const med = await prisma.medication.update({ where: { id: req.params.id }, data });
  await logAudit(req, 'MEDICATION_UPDATED', med.name, await forPatient(med.serviceUserId));
  res.json(med);
}

export async function deleteMedication(req: AuthRequest, res: Response) {
  const med = await prisma.medication.findUnique({ where: { id: req.params.id }, select: { name: true, serviceUserId: true, endDate: true } });
  // Discontinue = soft-delete (keeps the administration history) and stamp the
  // discontinue date so the MAR chart shows it was given up to that point, then
  // ends. Defaults to now, but a manager can back-date it — carers often report
  // a med was stopped a few days earlier.
  const provided = req.body?.endDate ? new Date(String(req.body.endDate)) : null;
  const endDate = provided && !isNaN(provided.getTime()) ? provided : new Date();
  await prisma.medication.update({ where: { id: req.params.id }, data: { active: false, endDate } });
  if (med) await logAudit(req, 'MEDICATION_DISCONTINUED', med.name, `${await forPatient(med.serviceUserId)} · discontinued ${endDate.toISOString().slice(0, 10)}`);
  res.json({ message: 'Medication discontinued' });
}

const adminInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  medication: { select: { id: true, name: true, dose: true, route: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

export async function listAdministrations(req: AuthRequest, res: Response) {
  const { serviceUserId, date, startDate, endDate, recent, status } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  if (status && Object.values(MedStatus).includes(String(status) as MedStatus)) where.status = String(status);
  Object.assign(where, relatedServiceUserScopeWhere(req.user));
  if (date) {
    const [y, m, d] = String(date).split('-').map(Number);
    where.scheduledFor = { gte: new Date(y, m - 1, d, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59) };
  } else if (startDate || endDate) {
    const range: Record<string, Date> = {};
    if (startDate) {
      const [y, m, d] = String(startDate).split('-').map(Number);
      range.gte = new Date(y, m - 1, d, 0, 0, 0);
    }
    if (endDate) {
      const [y, m, d] = String(endDate).split('-').map(Number);
      range.lte = new Date(y, m - 1, d, 23, 59, 59);
    }
    where.scheduledFor = range;
  }
  const records = await prisma.medAdministration.findMany({
    where,
    include: adminInclude,
    orderBy: serviceUserId && date ? { scheduledFor: 'asc' } : { recordedAt: 'desc' },
    take: recent ? Number(recent) || 100 : undefined,
  });
  res.json(records);
}

// Dose slots (medication + scheduled time) whose visit was CANCELLED and which
// no active visit that day absorbs — so the MAR chart can mark them "C" instead
// of leaving a blank that reads as "not recorded". Read-only; computed live from
// the schedule, so un-cancelling a visit clears the C automatically.
export async function cancelledDoses(req: AuthRequest, res: Response) {
  const { serviceUserId, startDate, endDate } = req.query as { serviceUserId?: string; startDate?: string; endDate?: string };
  if (!serviceUserId || !startDate || !endDate) return res.json([]);
  const [sy, sm, sd] = String(startDate).split('-').map(Number);
  const [ey, em, ed] = String(endDate).split('-').map(Number);
  const rangeStart = new Date(sy, sm - 1, sd, 0, 0, 0);
  const rangeEnd = new Date(ey, em - 1, ed, 23, 59, 59);

  const meds = await prisma.medication.findMany({
    where: { serviceUserId: String(serviceUserId), active: true, ...relatedServiceUserScopeWhere(req.user) },
    select: { id: true, times: true, daysOfWeek: true, intervalDays: true, startDate: true, endDate: true, createdAt: true },
  });
  if (meds.length === 0) return res.json([]);

  const shifts = await prisma.shift.findMany({
    where: { serviceUserId: String(serviceUserId), date: { gte: rangeStart, lt: new Date(rangeEnd.getTime() + 1000) } },
    select: { id: true, startTime: true, endTime: true, date: true, status: true, givesMedication: true },
  });
  // Group visits by their calendar day (UTC, matching how dose slots are keyed).
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = `${s.date.getUTCFullYear()}-${s.date.getUTCMonth()}-${s.date.getUTCDate()}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s);
  }

  const out: { medicationId: string; scheduledFor: string }[] = [];
  for (let dt = new Date(rangeStart); dt <= rangeEnd; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear(), m0 = dt.getMonth(), d = dt.getDate();
    const dayKey = `${y}-${m0}-${d}`;
    const dayShifts = (byDay.get(dayKey) ?? []).filter((s) => s.givesMedication !== false);
    if (dayShifts.length === 0) continue; // no visits that day → nothing was cancelled
    const active = dayShifts.filter((s) => s.status !== 'CANCELLED');
    const ymd = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    for (const med of meds) {
      const startYmd = med.startDate ? med.startDate.toISOString().slice(0, 10) : null;
      const endYmd = med.endDate ? med.endDate.toISOString().slice(0, 10) : null;
      if (startYmd && ymd < startYmd) continue;
      if (endYmd && ymd > endYmd) continue;
      if (!isMedDueOn(med, new Date(Date.UTC(y, m0, d)))) continue;
      let times: string[] = [];
      try { times = JSON.parse(med.times || '[]'); } catch { times = []; }

      for (const t of times) {
        // If an active visit absorbs the dose it isn't cancelled — it moved to
        // that visit. Only when no active visit owns it and a cancelled one would
        // have is the dose genuinely cancelled.
        if (ownerShiftIdForDose(active, t)) continue;
        const ownerId = ownerShiftIdForDose(dayShifts, t);
        const owner = ownerId ? dayShifts.find((s) => s.id === ownerId) : null;
        if (owner && owner.status === 'CANCELLED') {
          const [h, mi] = t.split(':').map(Number);
          out.push({ medicationId: med.id, scheduledFor: new Date(Date.UTC(y, m0, d, h, mi, 0)).toISOString() });
        }
      }
    }
  }
  res.json(out);
}

/**
 * Medications that are scheduled, so they can be checked against what they
 * actually are.
 *
 * A when-required medicine set up with dose times is scored every day it was
 * not needed. The carer has to put something in the box and "Missed" is what
 * they reach for, so a GTN spray for chest pain — which cannot be missed, only
 * unneeded — turns into a Regulation 12 finding. Caremid already handles these
 * properly: a medication with NO dose times is an as-required one, recorded
 * when it is given and never scored.
 *
 * `asRequired` here is a hint from the wording, not a verdict. The difference
 * between a when-required medicine and a regular one is a clinical fact, and
 * clearing the times on something a person actually needs every day would stop
 * the carer being prompted for it. So this lists and flags; a person decides.
 */
const PRN_WORDING = /\b(when|as|if)\s+(required|needed)\b|\bp\.?r\.?n\b|\bwhen\s+necessary\b/i;

export async function medicationSchedule(req: AuthRequest, res: Response) {
  const rows = await prisma.medication.findMany({
    where: { active: true, ...relatedServiceUserScopeWhere(req.user) },
    select: {
      id: true, name: true, dose: true, instructions: true, times: true,
      serviceUser: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const out = rows
    .map((m) => {
      let times: string[] = [];
      try { times = JSON.parse(m.times || '[]'); } catch { times = []; }
      const text = `${m.name} ${m.dose ?? ''} ${m.instructions ?? ''}`;
      return {
        id: m.id,
        name: m.name,
        dose: m.dose,
        instructions: m.instructions,
        times,
        scheduled: times.length > 0,
        asRequired: PRN_WORDING.test(text),
        serviceUser: m.serviceUser ? `${m.serviceUser.firstName} ${m.serviceUser.lastName}`.trim() : null,
        serviceUserId: m.serviceUser?.id ?? null,
      };
    })
    .filter((m) => m.scheduled)
    .sort((a, b) => Number(b.asRequired) - Number(a.asRequired) || (a.serviceUser ?? '').localeCompare(b.serviceUser ?? ''));

  res.json(out);
}

/**
 * Turn scheduled medications into as-required ones by clearing their dose
 * times. By explicit id only — never by a wording match, because a wrong match
 * stops a carer being prompted for something a person needs.
 *
 * Nothing recorded is touched: the doses already given stay on the chart
 * exactly as they are. What changes is that no NEW slot falls due.
 */
export async function clearMedicationTimes(req: AuthRequest, res: Response) {
  const { ids } = req.body as { ids?: unknown };
  const list = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string').slice(0, 200) : [];
  if (!list.length) return res.status(400).json({ error: 'ids is required.' });

  const rows = await prisma.medication.findMany({
    where: { id: { in: list }, ...relatedServiceUserScopeWhere(req.user) },
    select: { id: true, name: true, times: true, serviceUser: { select: { firstName: true, lastName: true } } },
  });

  const changed: { id: string; name: string; client: string; wasTimes: string }[] = [];
  for (const m of rows) {
    if (!m.times || m.times === '[]') continue;
    await prisma.medication.update({ where: { id: m.id }, data: { times: '[]' } });
    changed.push({
      id: m.id,
      name: m.name,
      client: m.serviceUser ? `${m.serviceUser.firstName} ${m.serviceUser.lastName}`.trim() : 'Unknown',
      wasTimes: m.times,
    });
  }

  for (const c of changed) {
    await logAudit(req, 'MEDICATION_SET_AS_REQUIRED', `${c.client} — ${c.name}`, `Dose times cleared (were ${c.wasTimes}). Recorded when given; no longer scored as a scheduled dose.`);
  }

  res.json({ changed: changed.length, medications: changed });
}

/**
 * The exceptions on a MAR, with the evidence that sits next to them.
 *
 * A dose recorded as missed almost never carries a note of its own — but the
 * carer usually wrote what happened in the visit's call log, which until now
 * lived on a different screen. "She went to the appointment, not back" is the
 * answer to why a dose was not given, and it was there all along.
 *
 * So this returns each exception with the call log of the visit that owned it,
 * and whether the client was away. That turns reclassifying a dose from a
 * guess into reading what the carer wrote.
 */
export async function marExceptions(req: AuthRequest, res: Response) {
  const { from, to, status, serviceUserId } = req.query as Record<string, string | undefined>;
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const fromYmd = ok(from);
  const toYmd = ok(to);
  if (!fromYmd || !toYmd) return res.status(400).json({ error: 'from and to are required, as yyyy-mm-dd.' });

  const want = status && Object.values(MedStatus).includes(status as never) ? status : 'MISSED';
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0));
  const end = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));

  const rows = await prisma.medAdministration.findMany({
    where: {
      status: want,
      scheduledFor: { gte: start, lte: end },
      ...(serviceUserId ? { serviceUserId } : {}),
      ...relatedServiceUserScopeWhere(req.user),
    },
    include: {
      medication: { select: { name: true, dose: true } },
      serviceUser: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });
  if (!rows.length) return res.json([]);

  const clientIds = [...new Set(rows.map((r) => r.serviceUserId))];
  const [shifts, logs, away] = await Promise.all([
    prisma.shift.findMany({
      where: { serviceUserId: { in: clientIds }, date: { gte: start, lte: end } },
      select: { id: true, serviceUserId: true, date: true, startTime: true, endTime: true, status: true, givesMedication: true, visitName: true },
    }),
    prisma.callLog.findMany({
      where: { serviceUserId: { in: clientIds }, createdAt: { gte: start, lte: new Date(end.getTime() + 36e5 * 36) } },
      select: { shiftId: true, note: true },
    }),
    awayWindows(clientIds, start, end),
  ]);

  const logByShift = new Map<string, string>();
  for (const l of logs) if (l.shiftId && l.note?.trim() && !logByShift.has(l.shiftId)) logByShift.set(l.shiftId, l.note.trim());

  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = `${s.serviceUserId}__${s.date.toISOString().slice(0, 10)}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s);
  }

  res.json(rows.map((r) => {
    const dayKey = `${r.serviceUserId}__${r.scheduledFor.toISOString().slice(0, 10)}`;
    const hh = String(r.scheduledFor.getUTCHours()).padStart(2, '0');
    const mm = String(r.scheduledFor.getUTCMinutes()).padStart(2, '0');
    const dayShifts = byDay.get(dayKey) ?? [];
    const ownerId = ownerShiftIdForDose(dayShifts, `${hh}:${mm}`);
    const owner = ownerId ? dayShifts.find((s) => s.id === ownerId) : null;
    return {
      id: r.id,
      scheduledFor: r.scheduledFor.toISOString(),
      status: r.status,
      note: r.note,
      medication: r.medication ? `${r.medication.name}${r.medication.dose ? ` ${r.medication.dose}` : ''}` : null,
      serviceUserId: r.serviceUserId,
      serviceUser: r.serviceUser ? `${r.serviceUser.firstName} ${r.serviceUser.lastName}`.trim() : null,
      recordedBy: r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : null,
      awayAtTheTime: awayTypeAt(away, r.serviceUserId, r.scheduledFor),
      visitName: owner?.visitName ?? null,
      visitStatus: owner?.status ?? null,
      callLog: owner ? logByShift.get(owner.id) ?? null : null,
    };
  }));
}

/**
 * Change what a recorded exception says it was.
 *
 * Only from MISSED, and only to a status that means the dose was not the
 * service's to give — in hospital, or not at home. It cannot turn a missed
 * dose into a given one: that is a different claim entirely and this is not
 * the route for it.
 *
 * Each change is audited with the status it replaced, so the original reading
 * of the record is recoverable.
 */
const RECLASSIFY_TO = ['NOT_AT_HOME', 'HOSPITAL'];

export async function reclassifyDoses(req: AuthRequest, res: Response) {
  const { ids, to, note } = req.body as { ids?: unknown; to?: unknown; note?: unknown };
  const list = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string').slice(0, 500) : [];
  if (!list.length) return res.status(400).json({ error: 'ids is required.' });
  const next = String(to || '').toUpperCase();
  if (!RECLASSIFY_TO.includes(next)) {
    return res.status(400).json({ error: `to must be one of ${RECLASSIFY_TO.join(', ')}.` });
  }

  const rows = await prisma.medAdministration.findMany({
    where: { id: { in: list }, ...relatedServiceUserScopeWhere(req.user) },
    include: { serviceUser: { select: { firstName: true, lastName: true } } },
  });
  const changeable = rows.filter((r) => r.status === 'MISSED');
  const refused = rows.filter((r) => r.status !== 'MISSED').map((r) => ({ id: r.id, status: r.status }));

  const extra = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  const stamp = new Date().toISOString().slice(0, 10);

  for (const r of changeable) {
    await prisma.medAdministration.update({
      where: { id: r.id },
      data: {
        status: next,
        note: [r.note, `Changed from Missed ${stamp}.${extra ? ` ${extra}` : ''}`].filter(Boolean).join(' — ').slice(0, 1000),
      },
    });
  }
  if (changeable.length) {
    await logAudit(
      req,
      'MAR_DOSES_RECLASSIFIED',
      `${changeable.length} dose(s)`,
      `Missed → ${next} for ${[...new Set(changeable.map((r) => `${r.serviceUser?.firstName} ${r.serviceUser?.lastName}`.trim()))].join(', ')}.${extra ? ` ${extra}` : ''}`,
    );
  }

  res.json({ changed: changeable.length, to: next, notMissed: refused });
}

/**
 * Fill the blanks a change of recording method left on the MAR.
 *
 * Dry run unless apply is true, and the dry run is the point: it reports what
 * WOULD be written and, just as usefully, what would not and why. If the
 * blanks really are an artefact of electronic recording not being enforced,
 * the month-by-month figures show it — they stop when the method changed.
 *
 * See lib/marBackfill.ts for the evidence rule. In short: a dose is only
 * filled where the visit that owned it was attended, by a named carer, on a
 * call that administers medication, with the client at home.
 */
export async function backfillMar(req: AuthRequest, res: Response) {
  const { from, to, serviceUserId, reason, apply } = req.body as Record<string, unknown>;
  const parse = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const fromYmd = parse(from);
  const toYmd = parse(to);
  if (!fromYmd || !toYmd) return res.status(400).json({ error: 'from and to are required, as yyyy-mm-dd.' });
  if (toYmd < fromYmd) return res.status(400).json({ error: 'to must not be before from.' });

  // Optional. Where none is given the row still says where it came from -
  // that marker is not an explanation anybody has to compose, it is just the
  // row being honest about being an office entry rather than a carer's.
  const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';

  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  const plan = await planBackfill({
    from: new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0)),
    to: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59)),
    serviceUserId: typeof serviceUserId === 'string' && serviceUserId ? serviceUserId : undefined,
    reason: why,
    apply: apply === true,
    limit: 5000,
  });

  // Names for the breakdown, so the caller is not reading cuids.
  const ids = Object.keys(plan.byClient);
  const clients = ids.length
    ? await prisma.serviceUser.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const named = clients
    .map((c) => ({ name: `${c.firstName} ${c.lastName}`.trim(), count: plan.byClient[c.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const body = {
    applied: false,
    from: fromYmd,
    to: toYmd,
    dosesDue: plan.dueTotal,
    wouldFill: plan.fillable.length,
    capped: plan.capped,
    byMonth: plan.byMonth,
    byClient: named,
    leftBlank: plan.skips,
  };

  if (apply !== true) return res.json(body);

  // The note is what makes each row honest on its own: a reader sees it was
  // entered by the office afterwards from the attendance record, not signed
  // by the carer at the time.
  const stamp = new Date().toISOString().slice(0, 10);
  const note = why
    ? `Office entry ${stamp} from the attendance record: ${why}`
    : `Office entry ${stamp} from the attendance record.`;

  let created = 0;
  for (let i = 0; i < plan.fillable.length; i += 200) {
    const batch = plan.fillable.slice(i, i + 200);
    const result = await prisma.medAdministration.createMany({
      data: batch.map((f) => ({
        medicationId: f.medicationId,
        serviceUserId: f.serviceUserId,
        scheduledFor: f.scheduledFor,
        status: 'GIVEN',
        userId: f.carerId,
        // The dose time, not now: recordedAt is "when it was given", and the
        // note carries when it was typed.
        recordedAt: f.scheduledFor,
        note,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }

  await logAudit(
    req,
    'MAR_BACKFILLED',
    serviceUserId ? String(serviceUserId) : 'All clients',
    `${created} dose(s) marked given from attendance records, ${fromYmd} to ${toYmd}.${why ? ` ${why}` : ''}`,
  );

  res.json({ ...body, applied: true, created });
}

export async function recordAdministration(req: AuthRequest, res: Response) {
  const { medicationId, serviceUserId, scheduledFor, status, note, recordedAt } = req.body;
  if (!medicationId || !serviceUserId || !scheduledFor || !status) {
    return res.status(400).json({ error: 'medicationId, serviceUserId, scheduledFor, status required' });
  }
  if (!Object.values(MedStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const when = new Date(scheduledFor);
  const record = await prisma.medAdministration.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    update: { status, note: note || null, userId: req.user!.id, recordedAt: clientTime(recordedAt) },
    create: { medicationId, serviceUserId, scheduledFor: when, status, note: note || null, userId: req.user!.id, recordedAt: clientTime(recordedAt) },
    include: adminInclude,
  });
  res.status(201).json(record);
}

// Office record/correction from the portal — used when a carer was offline and
// their entry never reached us, or to fix a wrong one. Unlike the carer path it
// can attribute the dose to the carer who actually gave it and set the real
// time given, and every change is audited (a MAR is a legal document). Keyed on
// medication + scheduled slot, so it both creates a missing record and edits an
// existing one.
export async function recordAdministrationByManager(req: AuthRequest, res: Response) {
  const { medicationId, serviceUserId, scheduledFor, status, note, userId, recordedAt } = req.body as {
    medicationId?: string; serviceUserId?: string; scheduledFor?: string; status?: string;
    note?: string; userId?: string | null; recordedAt?: string;
  };
  if (!medicationId || !serviceUserId || !scheduledFor || !status) {
    return res.status(400).json({ error: 'medicationId, serviceUserId, scheduledFor, status required' });
  }
  if (!Object.values(MedStatus).includes(status as MedStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  // Attribute to the named carer if given (and only if they're a real user);
  // null clears it. When omitted, fall back to the office user recording it.
  let carerId: string | null = req.user!.id;
  if (userId === null) carerId = null;
  else if (userId) {
    const carer = await prisma.user.findFirst({ where: { id: userId }, select: { id: true } });
    if (!carer) return res.status(400).json({ error: 'Selected carer not found' });
    carerId = carer.id;
  }
  const when = new Date(scheduledFor);
  const recAt = recordedAt ? new Date(recordedAt) : new Date();
  const existing = await prisma.medAdministration.findUnique({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    select: { id: true },
  });
  const record = await prisma.medAdministration.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    update: { status, note: note || null, userId: carerId, recordedAt: recAt },
    create: { medicationId, serviceUserId, scheduledFor: when, status, note: note || null, userId: carerId, recordedAt: recAt },
    include: adminInclude,
  });
  await logAudit(
    req,
    existing ? 'MED_ADMIN_EDITED' : 'MED_ADMIN_RECORDED',
    `${record.medication.name} @ ${when.toISOString().slice(0, 16).replace('T', ' ')}`,
    `${STATUS_WORD[status as MedStatus] || status}${(await forPatient(serviceUserId)) || ''}`,
  );
  res.status(existing ? 200 : 201).json(record);
}
