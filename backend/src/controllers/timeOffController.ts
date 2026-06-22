import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToUser } from '../lib/socket';
import { sendEmail, timeOffDecisionEmail } from '../lib/email';

const timeOffInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
};

export async function listTimeOff(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  if (req.user!.role === Role.EMPLOYEE) {
    where.userId = req.user!.id;
  }
  if (req.query.status) where.status = req.query.status;

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
