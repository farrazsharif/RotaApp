import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { relatedStaffScopeWhere } from '../lib/scope';

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
  const meds = await prisma.medication.findMany({ where: { serviceUserId: shift.serviceUserId, active: true } });
  const day = shift.date;
  const out: Array<{ medicationId: string; name: string; dose: string | null; route: string | null; time: string; scheduledFor: string; status: string | null; recordedAt: string | null }> = [];
  for (const med of meds) {
    let times: string[] = [];
    try { times = JSON.parse(med.times || '[]'); } catch { times = []; }
    for (const t of times) {
      // dose is "due at this call" if its time falls within the call window
      if (t < shift.startTime || t > shift.endTime) continue;
      const [h, mi] = t.split(':').map(Number);
      const scheduledFor = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0);
      const admin = await prisma.medAdministration.findUnique({
        where: { medicationId_scheduledFor: { medicationId: med.id, scheduledFor } },
      });
      out.push({
        medicationId: med.id, name: med.name, dose: med.dose, route: med.route,
        time: t, scheduledFor: scheduledFor.toISOString(), status: admin?.status ?? null,
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

  // Compulsory eMAR: cannot clock out while medication doses due for this call are unrecorded
  const doses = await dueDosesForShift(record.shiftId);
  const pending = doses.filter((d) => !d.status);
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
    if (startDate) (where.clockIn as Record<string, unknown>).gte = new Date(startDate as string);
    if (endDate) (where.clockIn as Record<string, unknown>).lte = new Date(endDate as string);
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
  const { clockIn, clockOut } = req.body;
  const data: Record<string, unknown> = {};
  if (clockIn) data.clockIn = new Date(clockIn);
  if (clockOut) data.clockOut = new Date(clockOut);

  const record = await prisma.clockRecord.update({
    where: { id: req.params.id },
    data,
    include: { user: { select: { id: true, firstName: true, lastName: true } }, shift: true },
  });
  res.json(record);
}
