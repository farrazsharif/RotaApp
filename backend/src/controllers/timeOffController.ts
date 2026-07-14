import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToUser } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { sendEmail, timeOffDecisionEmail } from '../lib/email';
import { relatedStaffScopeWhere } from '../lib/scope';

// When leave is approved, take the carer off any calls they're assigned to in
// the leave window so those calls become open/unassigned for a manager to
// re-cover. Calls the carer has already clocked into, and cancelled calls, are
// left untouched. Returns the calls that were freed up.
async function releaseShiftsForLeave(userId: string, startDate: Date, endDate: Date) {
  const rangeStart = new Date(startDate); rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate); rangeEnd.setHours(23, 59, 59, 999);

  const shifts = await prisma.shift.findMany({
    where: {
      date: { gte: rangeStart, lte: rangeEnd },
      status: { not: 'CANCELLED' },
      OR: [{ userId }, { coverCarers: { some: { id: userId } } }],
    },
    include: {
      coverCarers: { select: { id: true } },
      clockRecords: { where: { userId }, select: { id: true } },
    },
  });

  const freed: string[] = [];
  for (const s of shifts) {
    if (s.clockRecords.length > 0) continue; // already started/worked — don't disturb
    if (s.userId === userId) {
      await prisma.shift.update({ where: { id: s.id }, data: { userId: null } });
      freed.push(s.id);
    } else if (s.coverCarers.some((c) => c.id === userId)) {
      await prisma.shift.update({ where: { id: s.id }, data: { coverCarers: { disconnect: { id: userId } } } });
      freed.push(s.id);
    }
  }
  return freed;
}

const timeOffInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
};

export async function listTimeOff(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  if (req.user!.role === Role.EMPLOYEE) {
    where.userId = req.user!.id;
  }
  if (req.query.status) where.status = req.query.status;
  Object.assign(where, relatedStaffScopeWhere(req.user));

  const requests = await prisma.timeOffRequest.findMany({
    where,
    include: timeOffInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
}

export async function createTimeOff(req: AuthRequest, res: Response) {
  const { startDate, endDate, type, reason } = req.body;
  if (!startDate || !endDate || !type) return res.status(400).json({ error: 'startDate, endDate, type required' });

  const request = await prisma.timeOffRequest.create({
    data: {
      userId: req.user!.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      type,
      reason: reason || null,
    },
    include: timeOffInclude,
  });

  // Notify managers
  const mgrs = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MANAGER'] } },
    select: { id: true, email: true },
  });
  for (const mgr of mgrs) {
    const n = await prisma.notification.create({
      data: {
        userId: mgr.id,
        type: 'TIME_OFF_APPROVED',
        title: 'New Time-Off Request',
        message: `${request.user.firstName} ${request.user.lastName} requested time off from ${new Date(startDate).toDateString()} to ${new Date(endDate).toDateString()}`,
        data: JSON.stringify({ requestId: request.id }),
      },
    });
    emitToUser(mgr.id, 'notification', n);
  }

  res.status(201).json(request);
}

export async function updateTimeOff(req: AuthRequest, res: Response) {
  const { status } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });

  const request = await prisma.timeOffRequest.update({
    where: { id: req.params.id },
    data: { status },
    include: timeOffInclude,
  });

  const notifType = status === 'APPROVED' ? 'TIME_OFF_APPROVED' : 'TIME_OFF_REJECTED';
  const n = await prisma.notification.create({
    data: {
      userId: request.userId,
      type: notifType,
      title: `Time-Off ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: `Your time-off request from ${new Date(request.startDate).toDateString()} to ${new Date(request.endDate).toDateString()} has been ${status.toLowerCase()}`,
      data: JSON.stringify({ requestId: request.id }),
    },
  });
  emitToUser(request.userId, 'notification', n);

  sendEmail(request.user.email, `Time-Off Request ${status}`, timeOffDecisionEmail(
    request.user.firstName, status,
    new Date(request.startDate).toDateString(),
    new Date(request.endDate).toDateString()
  ));

  // On approval, free up the carer's calls in the leave window so they can be
  // re-covered. They stay on the schedule as unassigned (needs cover).
  if (status === 'APPROVED') {
    const freed = await releaseShiftsForLeave(request.userId, request.startDate, request.endDate);
    if (freed.length > 0) {
      const carerName = `${request.user.firstName} ${request.user.lastName}`;
      const range = `${new Date(request.startDate).toDateString()} – ${new Date(request.endDate).toDateString()}`;
      const noun = `${freed.length} call${freed.length > 1 ? 's' : ''}`;

      // Tell the carer they've been taken off those calls.
      const carerNote = await prisma.notification.create({
        data: {
          userId: request.userId, type: 'SHIFT_REMOVED', title: 'Calls Removed for Leave',
          message: `You've been removed from ${noun} during your approved time off.`,
          data: JSON.stringify({ shiftIds: freed }),
        },
      });
      emitToUser(request.userId, 'notification', carerNote);
      await sendPushToUser(request.userId, { title: 'Calls Removed for Leave', body: `You've been removed from ${noun} during your approved time off.` });

      // Tell managers there are now calls needing cover.
      const mgrList = await prisma.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'MANAGER'] } }, select: { id: true } });
      const mgrMsg = `${carerName}'s leave freed ${noun} needing cover (${range}).`;
      await Promise.all(mgrList.map(async (m) => {
        const mn = await prisma.notification.create({
          data: { userId: m.id, type: 'SHIFT_REMOVED', title: 'Calls Need Cover', message: mgrMsg, data: JSON.stringify({ shiftIds: freed }) },
        });
        emitToUser(m.id, 'notification', mn);
        await sendPushToUser(m.id, { title: 'Calls Need Cover', body: mgrMsg, url: '/schedule' });
      }));
    }
  }

  res.json(request);
}

export async function deleteTimeOff(req: AuthRequest, res: Response) {
  const request = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.userId !== req.user!.id) return res.status(403).json({ error: 'Not your request' });
  if (request.status !== 'PENDING') return res.status(400).json({ error: 'Cannot delete actioned request' });

  await prisma.timeOffRequest.delete({ where: { id: req.params.id } });
  res.json({ message: 'Request deleted' });
}
