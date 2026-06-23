import { Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToUser } from '../lib/socket';
import { sendEmail, shiftAssignedEmail } from '../lib/email';

const shiftInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  coverCarers: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true, site: { select: { id: true, name: true, color: true } } } },
  clockRecords: { select: { id: true, userId: true, clockIn: true, clockOut: true } },
};

export async function listShifts(req: AuthRequest, res: Response) {
  const { startDate, endDate, userId } = req.query;
  const where: Record<string, unknown> = {};

  if (req.user!.role === Role.EMPLOYEE) {
    where.userId = req.user!.id;
  } else if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate as string);
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate as string);
  }

  const shifts = await prisma.shift.findMany({
    where,
    include: shiftInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  res.json(shifts);
}

export async function getShift(req: AuthRequest, res: Response) {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id }, include: shiftInclude });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  res.json(shift);
}

// Parse a 'yyyy-mm-dd' string into a local Date at midday (avoids timezone day-shift).
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

interface Repeat {
  daysOfWeek: number[]; // 0 = Sunday … 6 = Saturday
  endType: 'date' | 'permanent';
  endDate?: string;
}

// Expand a recurring visit into one date per matching weekday up to the end date
// (permanent recurrences are capped at 1 year ahead).
function buildRecurringDates(startStr: string, repeat: Repeat): Date[] {
  const start = parseLocalDate(startStr);
  const end =
    repeat.endType === 'date' && repeat.endDate
      ? parseLocalDate(repeat.endDate)
      : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), 12, 0, 0);

  const dates: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (repeat.daysOfWeek.includes(cur.getDay())) dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates.length ? dates : [start];
}

export async function createShift(req: AuthRequest, res: Response) {
  const { userId, serviceUserId, date, startTime, endTime, visitName, cover, coverCarerIds, role, notes, repeat } = req.body;
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: 'date, startTime, endTime required' });
  }
  if (!serviceUserId) {
    return res.status(400).json({ error: 'A service user (patient) is required' });
  }

  const baseData = {
    userId: userId || null,
    serviceUserId: serviceUserId || null,
    startTime,
    endTime,
    visitName: visitName || null,
    cover: Number(cover) || 1,
    role: role || null,
    notes: notes || null,
  };

  const coverConnect = Array.isArray(coverCarerIds) && coverCarerIds.length
    ? { coverCarers: { connect: coverCarerIds.filter(Boolean).map((id: string) => ({ id })) } }
    : {};

  const useRepeat = repeat && Array.isArray(repeat.daysOfWeek) && repeat.daysOfWeek.length > 0;
  const dates = useRepeat ? buildRecurringDates(date, repeat as Repeat) : [new Date(date)];
  const seriesId = useRepeat ? randomUUID() : null;
  const hasCoverCarers = Array.isArray(coverCarerIds) && coverCarerIds.filter(Boolean).length > 0;

  let shift;
  let createdCount: number;

  if (dates.length > 1 && !hasCoverCarers) {
    // Recurring visits with no specific cover carers to connect: one bulk
    // INSERT instead of one round-trip per date. This matters a lot once the
    // database is remote — hundreds of individual creates (e.g. a permanent
    // weekly repeat) can otherwise take tens of seconds.
    const result = await prisma.shift.createMany({
      data: dates.map((d) => ({ ...baseData, seriesId, date: d })),
    });
    createdCount = result.count;
    shift = await prisma.shift.findFirst({
      where: { seriesId },
      orderBy: { date: 'asc' },
      include: shiftInclude,
    });
  } else {
    const created = await prisma.$transaction(
      dates.map((d) => prisma.shift.create({ data: { ...baseData, ...coverConnect, seriesId, date: d }, include: shiftInclude }))
    );
    createdCount = created.length;
    shift = created[0];
  }

  // Notify the assigned carer, if one was set (a single summary notification for recurring visits)
  if (userId && shift) {
    const message =
      createdCount > 1
        ? `You have ${createdCount} new shifts scheduled, starting ${new Date(date).toDateString()} (${startTime}–${endTime})`
        : `You have a new shift on ${new Date(date).toDateString()} from ${startTime} to ${endTime}`;
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'SHIFT_ASSIGNED',
        title: createdCount > 1 ? 'New Shifts Assigned' : 'New Shift Assigned',
        message,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(userId, 'notification', notification);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      sendEmail(user.email, 'New Shift Assigned', shiftAssignedEmail(
        user.firstName, new Date(date).toDateString(), startTime, endTime
      ));
    }
  }

  res.status(201).json({ ...shift, createdCount });
}

export async function updateShift(req: AuthRequest, res: Response) {
  const { date, startTime, endTime, visitName, cover, coverCarerIds, role, notes, status, serviceUserId, userId } = req.body;
  const data: Record<string, unknown> = {};
  if (date !== undefined) data.date = new Date(date);
  if (userId !== undefined) data.userId = userId || null;
  if (serviceUserId !== undefined) data.serviceUserId = serviceUserId || null;
  if (startTime !== undefined) data.startTime = startTime;
  if (endTime !== undefined) data.endTime = endTime;
  if (visitName !== undefined) data.visitName = visitName || null;
  if (cover !== undefined) data.cover = Number(cover) || 1;
  if (Array.isArray(coverCarerIds)) {
    data.coverCarers = { set: coverCarerIds.filter(Boolean).map((id: string) => ({ id })) };
  }
  if (role !== undefined) data.role = role;
  if (notes !== undefined) data.notes = notes;
  if (status !== undefined) data.status = status;

  const shift = await prisma.shift.update({ where: { id: req.params.id }, data, include: shiftInclude });

  if (shift.userId) {
    const notification = await prisma.notification.create({
      data: {
        userId: shift.userId,
        type: 'SHIFT_UPDATED',
        title: 'Shift Updated',
        message: `Your shift on ${new Date(shift.date).toDateString()} has been updated`,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(shift.userId, 'notification', notification);
  }

  res.json(shift);
}

export async function deleteShift(req: AuthRequest, res: Response) {
  // scope: 'one' (default) | 'future' (this + later in series) | 'days' (matching weekdays from this date)
  const scope = String(req.query.scope || 'one');
  const days = String(req.query.days || '')
    .split(',')
    .filter(Boolean)
    .map(Number);

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });

  let idsToCancel: string[] = [shift.id];

  if (shift.seriesId && scope !== 'one') {
    const laterInSeries = await prisma.shift.findMany({
      where: { seriesId: shift.seriesId, date: { gte: shift.date }, status: { not: 'CANCELLED' } },
      select: { id: true, date: true },
    });
    if (scope === 'future') {
      idsToCancel = laterInSeries.map((s) => s.id);
    } else if (scope === 'days') {
      idsToCancel = laterInSeries.filter((s) => days.includes(new Date(s.date).getDay())).map((s) => s.id);
    }
  }

  await prisma.shift.updateMany({ where: { id: { in: idsToCancel } }, data: { status: 'CANCELLED' } });

  if (shift.userId) {
    const count = idsToCancel.length;
    const notification = await prisma.notification.create({
      data: {
        userId: shift.userId,
        type: 'SHIFT_CANCELLED',
        title: count > 1 ? 'Shifts Cancelled' : 'Shift Cancelled',
        message:
          count > 1
            ? `${count} of your shifts have been cancelled`
            : `Your shift on ${new Date(shift.date).toDateString()} has been cancelled`,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(shift.userId, 'notification', notification);
  }

  res.json({ message: 'Cancelled', count: idsToCancel.length });
}

// Assign (or clear) a carer across a recurring series.
// scope: 'one' (default) | 'future' (this + later in series) | 'days' (matching weekdays from this date)
export async function assignShiftCarer(req: AuthRequest, res: Response) {
  const { userId, coverCarerIds, scope, days } = req.body as { userId?: string; coverCarerIds?: string[]; scope?: string; days?: number[] };
  const dayList = Array.isArray(days) ? days.map(Number) : [];

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });

  let ids: string[] = [shift.id];
  if (shift.seriesId && scope && scope !== 'one') {
    const later = await prisma.shift.findMany({
      where: { seriesId: shift.seriesId, date: { gte: shift.date }, status: { not: 'CANCELLED' } },
      select: { id: true, date: true },
    });
    if (scope === 'future') {
      ids = later.map((s) => s.id);
    } else if (scope === 'days') {
      ids = later.filter((s) => dayList.includes(new Date(s.date).getDay())).map((s) => s.id);
    }
  }

  if (Array.isArray(coverCarerIds)) {
    // Cover carers are a relation, so set them per-shift (updateMany can't touch relations)
    const connectSet = coverCarerIds.filter(Boolean).map((id) => ({ id }));
    await prisma.$transaction(
      ids.map((id) =>
        prisma.shift.update({ where: { id }, data: { userId: userId || null, coverCarers: { set: connectSet } } })
      )
    );
  } else {
    await prisma.shift.updateMany({ where: { id: { in: ids } }, data: { userId: userId || null } });
  }

  if (userId) {
    const count = ids.length;
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'SHIFT_ASSIGNED',
        title: count > 1 ? 'Shifts Assigned' : 'Shift Assigned',
        message:
          count > 1
            ? `You have been assigned to ${count} shifts`
            : `You have been assigned to the shift on ${new Date(shift.date).toDateString()}`,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(userId, 'notification', notification);
  }

  res.json({ message: 'Assigned', count: ids.length });
}

// Cancel many shifts at once (e.g. everything currently shown on the schedule).
export async function cancelBulkShifts(req: AuthRequest, res: Response) {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const result = await prisma.shift.updateMany({
    where: { id: { in: ids }, status: { not: 'CANCELLED' } },
    data: { status: 'CANCELLED' },
  });

  res.json({ message: 'Cancelled', count: result.count });
}

export async function bulkCreateShifts(req: AuthRequest, res: Response) {
  const { shifts } = req.body as { shifts: Array<{ userId: string; date: string; startTime: string; endTime: string; role?: string; notes?: string }> };
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: 'shifts array required' });
  }

  const created = await prisma.$transaction(
    shifts.map((s) =>
      prisma.shift.create({
        data: {
          userId: s.userId,
          date: new Date(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          role: s.role || null,
          notes: s.notes || null,
        },
        include: shiftInclude,
      })
    )
  );

  res.status(201).json(created);
}
