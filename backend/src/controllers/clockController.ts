import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';

// The logged-in carer's calls for a given day (default today), ordered by visit time.
// Includes calls where they are the primary carer or an additional cover carer.
export async function myCalls(req: AuthRequest, res: Response) {
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59);

  const calls = await prisma.shift.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      status: { not: 'CANCELLED' },
      published: true,
      OR: [{ userId: req.user!.id }, { coverCarers: { some: { id: req.user!.id } } }],
    },
    include: {
      serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true } },
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
  const out: Array<{ medicationId: string; name: string; dose: string | null; route: string | null; time: string; scheduledFor: string; status: string | null }> = [];
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

  // Compulsory call log: must write a note for this visit before clocking out.
  if (record.shiftId) {
    const log = await prisma.callLog.findFirst({
      where: { shiftId: record.shiftId, userId: req.user!.id, createdAt: { gte: record.clockIn } },
    });
    if (!log) {
      return res.status(400).json({ error: 'Write a call log entry before clocking out' });
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
