import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { relatedStaffScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';

// The logged-in carer's calls for a given day (default today), ordered by visit time.
// Includes calls where they are the primary carer or an additional cover carer.
export async function myCalls(req: AuthRequest, res: Response) {
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59);

  const calls = await prisma.shift.findMany({
    where: {
      status: { not: 'CANCELLED' },
      published: true,
      // Must be one of the carer's own calls…
      AND: [
        { OR: [{ userId: req.user!.id }, { coverCarers: { some: { id: req.user!.id } } }] },
        // …and either falls on the requested day, OR the carer is still clocked
        // into it (open clock record). The second clause keeps an overnight shift
        // (e.g. 19:00–07:00 dated yesterday) visible past midnight so the carer
        // can always reach it to clock out — otherwise it vanishes at 00:00 while
        // the clock-out is still pending.
        {
          OR: [
            { date: { gte: dayStart, lte: dayEnd } },
            { clockRecords: { some: { userId: req.user!.id, clockOut: null } } },
          ],
        },
      ],
    },
    include: {
      serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true } },
      run: { select: { id: true, name: true, color: true } },
      clockRecords: { where: { userId: req.user!.id }, select: { id: true, userId: true, clockIn: true, clockOut: true } },
    },
    orderBy: [{ startTime: 'asc' }],
  });
  res.json(calls);
}

// Medication doses due during a shift's call window, with their current status.
async function dueDosesForShift(shiftId: string | null) {
  if (!shiftId) return [];
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || !shift.serviceUserId) return [];
  // Personal-care-only visits don't administer medication — hide all doses
  // (scheduled and PRN) so they don't show to, or block, that carer.
  if ((shift as { givesMedication?: boolean }).givesMedication === false) return [];
  const meds = await prisma.medication.findMany({ where: { serviceUserId: shift.serviceUserId, active: true } });
  const day = shift.date;
  // Overnight visits (e.g. 19:00–07:00) wrap past midnight, so the call window
  // is start→midnight→end. A plain start<=t<=end test is empty for those and
  // would drop every dose (why night-shift meds showed "none due").
  const overnight = shift.endTime < shift.startTime;

  // A dose's scheduled time is a nominal label (GP says "morning" = 08:00), but a
  // visit rarely lines up to the minute — a Morning Call might run 09:00–10:00.
  // A strict "time inside the window" test then drops the morning dose entirely,
  // so carers saw "no medication due". To fix this we still show any dose whose
  // time lands inside a visit, but a dose that lands inside NO visit that day is
  // "orphaned" and gets attached to the nearest visit within a grace window, so
  // it surfaces on the closest call instead of vanishing.
  const DOSE_VISIT_GRACE_MIN = 180; // how far (mins) a stray dose can reach to a visit
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const inWindow = (s: { startTime: string; endTime: string }, t: string) =>
    s.endTime < s.startTime ? (t >= s.startTime || t <= s.endTime) : (t >= s.startTime && t <= s.endTime);
  const distToWindow = (s: { startTime: string; endTime: string }, t: string) => {
    if (inWindow(s, t)) return 0;
    const tm = toMin(t), sm = toMin(s.startTime), em = toMin(s.endTime);
    if (s.endTime < s.startTime) return Math.min(Math.abs(tm - em), Math.abs(sm - tm)); // overnight hole
    return tm < sm ? sm - tm : tm - em;
  };
  // Candidate visits that could own an orphan dose: the same client's other calls
  // that day which actually administer meds (exclude cancelled + personal-care-only).
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const lo = new Date(day); lo.setDate(lo.getDate() - 1);
  const hi = new Date(day); hi.setDate(hi.getDate() + 2);
  const targetKey = dayKey(day);
  const candidates = (await prisma.shift.findMany({
    where: { serviceUserId: shift.serviceUserId, date: { gte: lo, lt: hi }, status: { not: 'CANCELLED' } },
    select: { id: true, startTime: true, endTime: true, date: true, givesMedication: true },
  })).filter((s) => dayKey(s.date) === targetKey && (s as { givesMedication?: boolean }).givesMedication !== false);
  // Does the CURRENT shift own dose time t? Yes if t is inside its own window, or
  // if t is inside no visit's window and this shift is the nearest one within grace.
  const ownsDose = (t: string): boolean => {
    if (inWindow(shift, t)) return true;
    if (candidates.some((c) => inWindow(c, t))) return false; // some other visit contains it
    let best = candidates[0] ? candidates[0] : null;
    let bestDist = best ? distToWindow(best, t) : Infinity;
    for (const c of candidates) {
      const d = distToWindow(c, t);
      if (d < bestDist || (d === bestDist && best && (c.startTime < best.startTime || (c.startTime === best.startTime && c.id < best.id)))) {
        best = c; bestDist = d;
      }
    }
    return !!best && best.id === shift.id && bestDist <= DOSE_VISIT_GRACE_MIN;
  };
  const visitYmd = day.toISOString().slice(0, 10);
  const out: Array<{ medicationId: string; name: string; dose: string | null; route: string | null; isBlisterPack: boolean; packContents: string | null; time: string; prn: boolean; scheduledFor: string; status: string | null; recordedAt: string | null }> = [];
  for (const med of meds) {
    // Respect a prescribed course window: a short-course med (e.g. a 10-day
    // antibiotic) only appears on visits within its start/end dates — it
    // auto-starts on the start date and auto-stops after the end date.
    const startYmd = med.startDate ? med.startDate.toISOString().slice(0, 10) : null;
    const endYmd = med.endDate ? med.endDate.toISOString().slice(0, 10) : null;
    if (startYmd && visitYmd < startYmd) continue;
    if (endYmd && visitYmd > endYmd) continue;

    // Weekday schedule: a med with specific days (e.g. Mon+Thu) only appears on
    // visits on those days. Empty list = every day. Weekday derived from the
    // visit date (0=Sun..6=Sat), consistent with visitYmd.
    let days: number[] = [];
    try { days = JSON.parse((med as { daysOfWeek?: string }).daysOfWeek || '[]'); } catch { days = []; }
    if (days.length > 0) {
      const dow = new Date(`${visitYmd}T00:00:00Z`).getUTCDay();
      if (!days.includes(dow)) continue;
    }

    let times: string[] = [];
    try { times = JSON.parse(med.times || '[]'); } catch { times = []; }

    // PRN / as-required meds have no set time. Surface one entry per visit
    // (anchored to the visit start for a stable record key) so the carer can
    // record it when actually given — but it never blocks clock-out.
    if (times.length === 0) {
      const [h, mi] = (shift.startTime || '12:00').split(':').map(Number);
      const scheduledFor = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0);
      const admin = await prisma.medAdministration.findUnique({
        where: { medicationId_scheduledFor: { medicationId: med.id, scheduledFor } },
      });
      out.push({
        medicationId: med.id, name: med.name, dose: med.dose, route: med.route,
        isBlisterPack: med.isBlisterPack, packContents: med.packContents,
        time: '', prn: true, scheduledFor: scheduledFor.toISOString(),
        status: admin?.status ?? null, recordedAt: admin?.recordedAt ? admin.recordedAt.toISOString() : null,
      });
      continue;
    }

    for (const t of times) {
      // Show the dose if this visit owns it: inside its window, or the nearest
      // visit for an orphan dose that lands in no window (see ownsDose above).
      if (!ownsDose(t)) continue;
      const [h, mi] = t.split(':').map(Number);
      // On an overnight visit, a dose at/before the end time is after midnight,
      // so it belongs to the next calendar day.
      const dayOffset = overnight && t <= shift.endTime ? 1 : 0;
      const scheduledFor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset, h, mi, 0);
      const admin = await prisma.medAdministration.findUnique({
        where: { medicationId_scheduledFor: { medicationId: med.id, scheduledFor } },
      });
      out.push({
        medicationId: med.id, name: med.name, dose: med.dose, route: med.route,
        isBlisterPack: med.isBlisterPack, packContents: med.packContents,
        time: t, prn: false, scheduledFor: scheduledFor.toISOString(), status: admin?.status ?? null,
        recordedAt: admin?.recordedAt ? admin.recordedAt.toISOString() : null,
      });
    }
  }
  return out;
}

// GET /clock/due-meds — meds due for the carer's active clock-in
export async function dueMeds(req: AuthRequest, res: Response) {
  const record = await prisma.clockRecord.findFirst({
    where: { userId: req.user!.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });
  if (!record) return res.json({ doses: [] });
  const doses = await dueDosesForShift(record.shiftId);
  res.json({ doses });
}

export async function clockIn(req: AuthRequest, res: Response) {
  const { shiftId } = req.body;

  // Check not already clocked in
  const existing = await prisma.clockRecord.findFirst({
    where: { userId: req.user!.id, clockOut: null },
  });
  if (existing) return res.status(400).json({ error: 'Already clocked in' });

  // Carers can only clock in to today's calls — not future or past ones.
  if (shiftId) {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    const now = new Date();
    const isToday =
      shift.date.getFullYear() === now.getFullYear() &&
      shift.date.getMonth() === now.getMonth() &&
      shift.date.getDate() === now.getDate();
    if (!isToday) {
      return res.status(400).json({ error: 'You can only clock in to today\'s calls' });
    }
    if (!shift.published) {
      return res.status(400).json({ error: 'This call has not been published yet' });
    }
  }

  const record = await prisma.clockRecord.create({
    data: {
      userId: req.user!.id,
      shiftId: shiftId || null,
      clockIn: new Date(),
    },
    include: { shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  res.status(201).json(record);
}

export async function clockOut(req: AuthRequest, res: Response) {
  const record = await prisma.clockRecord.findFirst({
    where: { userId: req.user!.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });
  if (!record) return res.status(400).json({ error: 'Not clocked in' });

  // Compulsory eMAR: cannot clock out while scheduled medication doses due for
  // this call are unrecorded. PRN / as-required meds are given only if needed,
  // so they never block clock-out.
  const doses = await dueDosesForShift(record.shiftId);
  const pending = doses.filter((d) => !d.status && !d.prn);
  if (pending.length > 0) {
    return res.status(400).json({
      error: 'Record medication before clocking out',
      pendingMeds: pending.map((d) => `${d.name} (${d.time})`),
    });
  }

  // Compulsory call log: the carer must have written OR signed the visit's log
  // before clocking out. On double/triple-up calls the log is shared, so a
  // co-carer signs the note the first carer wrote rather than writing their own.
  if (record.shiftId) {
    const logs = await prisma.callLog.findMany({
      where: { shiftId: record.shiftId },
      select: { userId: true, signedBy: true },
    });
    const signed = logs.some((l) => {
      if (l.userId === req.user!.id) return true;
      try {
        const sigs = JSON.parse(l.signedBy || '[]');
        return Array.isArray(sigs) && sigs.some((s: { userId?: string }) => s?.userId === req.user!.id);
      } catch { return false; }
    });
    if (!signed) {
      return res.status(400).json({ error: 'Sign the call log before clocking out' });
    }
  }

  // Note: there is no minimum-duration block on clock-out. A visit can be
  // genuinely short (e.g. the client isn't home or has gone to hospital), so the
  // carer must always be able to clock out. If they forgot to clock in, they can
  // still correct their start time via "Adjust start time" beforehand, and short
  // visits are surfaced for review in the ECM report.
  const updated = await prisma.clockRecord.update({
    where: { id: record.id },
    data: { clockOut: new Date() },
    include: { shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  res.json(updated);
}

export async function getClockStatus(req: AuthRequest, res: Response) {
  const active = await prisma.clockRecord.findFirst({
    where: { userId: req.user!.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
    include: { shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  res.json({ clockedIn: !!active, record: active || null });
}

// Everyone currently clocked in right now (manager-wide), for the dashboard.
export async function listActiveClockRecords(req: AuthRequest, res: Response) {
  const records = await prisma.clockRecord.findMany({
    where: { clockOut: null, ...relatedStaffScopeWhere(req.user) },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: { clockIn: 'asc' },
  });
  res.json(records);
}

export async function listClockRecords(req: AuthRequest, res: Response) {
  const { userId, startDate, endDate } = req.query;
  const where: Record<string, unknown> = {};

  if (req.user!.role === Role.EMPLOYEE) {
    where.userId = req.user!.id;
  } else if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.clockIn = {};
    // Clock-ins carry a real time-of-day, so the end bound must span the WHOLE
    // final day — a bare date (midnight) would drop every record after 00:00 on
    // the last day, hiding today's clock-ins whenever the range ends "today".
    if (startDate) (where.clockIn as Record<string, unknown>).gte = new Date(`${String(startDate).slice(0, 10)}T00:00:00.000`);
    if (endDate) (where.clockIn as Record<string, unknown>).lte = new Date(`${String(endDate).slice(0, 10)}T23:59:59.999`);
  }
  Object.assign(where, relatedStaffScopeWhere(req.user));

  const records = await prisma.clockRecord.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } },
    },
    orderBy: { clockIn: 'desc' },
  });
  res.json(records);
}

// Carer self-service: correct the actual start and/or end time on your OWN
// clock record — for when you did the visit but forgot to clock in/out and
// recorded it late, so the times would otherwise be wrong (a 30-min visit
// showing as 2 hours, etc.). Bounded so end is after start, nothing is in the
// future, and the window isn't implausibly long.
export async function setClockTimes(req: AuthRequest, res: Response) {
  const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
  if (!startTime && !endTime) return res.status(400).json({ error: 'startTime or endTime required' });

  const record = await prisma.clockRecord.findUnique({ where: { id: req.params.id } });
  if (!record || record.userId !== req.user!.id) return res.status(404).json({ error: 'Clock record not found' });

  const now = Date.now();
  let newIn = record.clockIn;
  let newOut = record.clockOut ?? null;

  if (startTime) {
    const d = new Date(startTime);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid start time' });
    newIn = d;
  }
  if (endTime) {
    const d = new Date(endTime);
    if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid end time' });
    newOut = d;
  }

  if (newIn.getTime() > now) return res.status(400).json({ error: 'Start time can’t be in the future' });
  if (newOut) {
    if (newOut.getTime() > now) return res.status(400).json({ error: 'Clock-out time can’t be in the future' });
    if (newOut.getTime() <= newIn.getTime()) return res.status(400).json({ error: 'Clock-out must be after the start time' });
  }
  // Catch date typos — a real forgotten visit is at most a shift-length ago.
  const span = (newOut?.getTime() ?? now) - newIn.getTime();
  if (span > 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'Those times are too far apart' });

  const updated = await prisma.clockRecord.update({
    where: { id: record.id },
    data: { clockIn: newIn, ...(newOut ? { clockOut: newOut } : {}) },
    include: { shift: { include: { serviceUser: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  res.json(updated);
}

export async function updateClockRecord(req: AuthRequest, res: Response) {
  const { clockIn, clockOut } = req.body as { clockIn?: string; clockOut?: string };

  const existing = await prisma.clockRecord.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Clock record not found' });

  const data: Record<string, unknown> = {};
  const newIn = clockIn ? new Date(clockIn) : existing.clockIn;
  if (clockIn) {
    if (isNaN(newIn.getTime())) return res.status(400).json({ error: 'Invalid clock-in time' });
    data.clockIn = newIn;
  }
  if (clockOut) {
    const out = new Date(clockOut);
    if (isNaN(out.getTime())) return res.status(400).json({ error: 'Invalid clock-out time' });
    // A manager-set clock-out must be after the clock-in and not in the future.
    if (out.getTime() <= newIn.getTime()) return res.status(400).json({ error: 'Clock-out must be after clock-in' });
    if (out.getTime() > Date.now() + 60_000) return res.status(400).json({ error: 'Clock-out can’t be in the future' });
    data.clockOut = out;
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const record = await prisma.clockRecord.update({
    where: { id: req.params.id },
    data,
    include: { user: { select: { id: true, firstName: true, lastName: true } }, shift: true },
  });

  // Audit trail — a manually-set clock time is a council-facing change.
  const who = `${existing.user.firstName} ${existing.user.lastName}`;
  const wasOpen = !existing.clockOut;
  const parts: string[] = [];
  if (clockIn) parts.push(`clock-in → ${new Date(clockIn).toISOString()}`);
  if (clockOut) parts.push(`${wasOpen ? 'manual clock-out' : 'clock-out'} → ${new Date(clockOut).toISOString()}`);
  await logAudit(req, 'CLOCK_RECORD_EDITED', who, parts.join('; '));

  res.json(record);
}
