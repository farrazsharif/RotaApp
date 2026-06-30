import { Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToUser } from '../lib/socket';
import { sendEmail, shiftAssignedEmail } from '../lib/email';
import { sendPushToUser } from '../lib/push';

const shiftInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  coverCarers: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true, status: true, statusUpdatedAt: true, site: { select: { id: true, name: true, color: true } } } },
  clockRecords: { select: { id: true, userId: true, clockIn: true, clockOut: true } },
};

export async function listShifts(req: AuthRequest, res: Response) {
  const { startDate, endDate, userId } = req.query;
  const where: Record<string, unknown> = {};

  if (req.user!.role === Role.EMPLOYEE) {
    where.userId = req.user!.id;
    // Carers only ever see published shifts — drafts stay manager-only until published.
    where.published = true;
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
    // New shifts start as drafts — carers won't see them until a manager
    // explicitly publishes (see publishShift / publishBulkShifts below).
    published: false,
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

  // Capture who's assigned before the update so we can tell, after it,
  // which of them got taken off (this endpoint sets the full assignment
  // each save, so a removal is just "was there before, isn't there now").
  const touchesAssignment = userId !== undefined || Array.isArray(coverCarerIds);
  const before = touchesAssignment
    ? await prisma.shift.findUnique({ where: { id: req.params.id }, include: { coverCarers: { select: { id: true } } } })
    : null;

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

  if (before) {
    const beforeIds = [before.userId, ...before.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    const afterIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    const removedIds = beforeIds.filter((id) => !afterIds.includes(id));
    await notifyCarersRemoved(removedIds.map((carerId) => ({ carerId, shift })));
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

  // Capture who's assigned on each touched shift before reassigning, so we
  // can tell afterwards who got dropped and notify them individually —
  // different shifts in the series can have had different carers.
  const beforeShifts = await prisma.shift.findMany({
    where: { id: { in: ids } },
    include: { coverCarers: { select: { id: true } } },
  });

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

  const removals = beforeShifts.flatMap((s) => {
    const beforeIds = [s.userId, ...s.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    // Cover carers only change when coverCarerIds was actually supplied —
    // otherwise they're untouched by the update above and shouldn't be
    // treated as removed.
    const afterCoverIds = Array.isArray(coverCarerIds) ? coverCarerIds.filter(Boolean) : s.coverCarers.map((c) => c.id);
    const afterIds = [userId, ...afterCoverIds].filter(Boolean) as string[];
    return beforeIds.filter((id) => !afterIds.includes(id)).map((carerId) => ({ carerId, shift: s }));
  });
  await notifyCarersRemoved(removals);

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

// A shift is fully assigned once it has as many carers (primary + cover) as
// its cover level requires — same rule the Schedule page uses to flag
// "needs staff". Only fully assigned shifts may be published to carers.
function isFullyAssigned(shift: { userId: string | null; cover: number; coverCarers: unknown[] }): boolean {
  const assigned = (shift.userId ? 1 : 0) + shift.coverCarers.length;
  const needed = shift.cover || 1;
  return assigned >= needed;
}

type NotifiableShift = { id: string; date: Date; startTime: string; endTime: string; visitName: string | null };

function singleShiftLine(shift: NotifiableShift): string {
  return `${shift.visitName || 'A call'} on ${new Date(shift.date).toDateString()}, ${shift.startTime}–${shift.endTime}`;
}

// Tell carers they've been taken off shifts they were previously assigned
// to — same in-app + push pairing as the other shift notifications, so it
// disappearing from their rota doesn't happen silently. Takes a flat list
// of (carer, shift) pairs and collapses everything for the same carer into
// one notification, so e.g. reassigning a whole recurring series doesn't
// fire a separate notification per shift.
async function notifyCarersRemoved(removals: { carerId: string; shift: NotifiableShift }[]) {
  const byCarer = new Map<string, NotifiableShift[]>();
  for (const { carerId, shift } of removals) {
    if (!byCarer.has(carerId)) byCarer.set(carerId, []);
    byCarer.get(carerId)!.push(shift);
  }

  await Promise.all(
    [...byCarer.entries()].map(async ([carerId, shifts]) => {
      const message =
        shifts.length > 1
          ? `You've been removed from ${shifts.length} shifts on your rota`
          : `You've been removed from ${singleShiftLine(shifts[0])}`;
      const notification = await prisma.notification.create({
        data: {
          userId: carerId,
          type: 'SHIFT_REMOVED',
          title: 'Removed from Shift',
          message,
          data: JSON.stringify({ shiftIds: shifts.map((s) => s.id) }),
        },
      });
      emitToUser(carerId, 'notification', notification);
      await sendPushToUser(carerId, { title: 'Removed from Shift', body: message });
    })
  );
}

// Tell carers their newly-published shifts are now live on their rota — an
// in-app notification plus a push so they see it even with the app closed.
// Takes every shift published in one action and collapses everything for
// the same carer into a single notification, so publishing a whole batch
// of calls (e.g. "Publish All Shown") doesn't fire one notification per
// shift per carer.
async function notifyShiftsPublished(shifts: (NotifiableShift & { userId: string | null; coverCarers: { id: string }[] })[]) {
  const byCarer = new Map<string, NotifiableShift[]>();
  for (const shift of shifts) {
    const carerIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    for (const carerId of carerIds) {
      if (!byCarer.has(carerId)) byCarer.set(carerId, []);
      byCarer.get(carerId)!.push(shift);
    }
  }

  await Promise.all(
    [...byCarer.entries()].map(async ([carerId, carerShifts]) => {
      const message =
        carerShifts.length > 1
          ? `${carerShifts.length} new shifts have been added to your rota`
          : `${singleShiftLine(carerShifts[0])} has been added to your rota`;
      const notification = await prisma.notification.create({
        data: {
          userId: carerId,
          type: 'SHIFT_PUBLISHED',
          title: carerShifts.length > 1 ? 'New Shifts on Your Rota' : 'New Shift on Your Rota',
          message,
          data: JSON.stringify({ shiftIds: carerShifts.map((s) => s.id) }),
        },
      });
      emitToUser(carerId, 'notification', notification);
      await sendPushToUser(carerId, {
        title: carerShifts.length > 1 ? 'New Shifts on Your Rota' : 'New Shift on Your Rota',
        body: message,
        url: carerShifts.length === 1 ? `/call/${carerShifts[0].id}` : '/rota',
      });
    })
  );
}

// Publish a single draft shift, making it visible to its assigned carer.
export async function publishShift(req: AuthRequest, res: Response) {
  const shift = await prisma.shift.findUnique({
    where: { id: req.params.id },
    include: { coverCarers: { select: { id: true } } },
  });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!isFullyAssigned(shift)) {
    return res.status(400).json({ error: 'Assign a carer to every cover slot before publishing this call' });
  }

  const updated = await prisma.shift.update({
    where: { id: req.params.id },
    data: { published: true },
    include: shiftInclude,
  });
  await notifyShiftsPublished([updated]);
  res.json(updated);
}

// Publish many shifts at once (e.g. everything currently shown on the schedule).
// Shifts that aren't fully assigned are silently skipped rather than erroring,
// since this is meant for "publish everything ready" bulk actions.
export async function publishBulkShifts(req: AuthRequest, res: Response) {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const candidates = await prisma.shift.findMany({
    where: { id: { in: ids }, published: false },
    include: { coverCarers: { select: { id: true } } },
  });
  const publishable = candidates.filter(isFullyAssigned);
  const publishableIds = publishable.map((s) => s.id);
  const skipped = candidates.length - publishableIds.length;

  const result = publishableIds.length
    ? await prisma.shift.updateMany({ where: { id: { in: publishableIds } }, data: { published: true } })
    : { count: 0 };

  await notifyShiftsPublished(publishable);

  res.json({ message: 'Published', count: result.count, skipped });
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
          published: false,
        },
        include: shiftInclude,
      })
    )
  );

  res.status(201).json(created);
}
