import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const include = {
  user: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  shift: { select: { id: true, date: true, startTime: true, endTime: true, visitName: true } },
};

export async function createCallLog(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, note } = req.body;
  if (!serviceUserId || !note || !String(note).trim()) {
    return res.status(400).json({ error: 'serviceUserId and note are required' });
  }
  const log = await prisma.callLog.create({
    data: {
      serviceUserId,
      shiftId: shiftId || null,
      userId: req.user!.id,
      note: String(note).trim(),
    },
    include,
  });
  res.status(201).json(log);
}

export async function listCallLogs(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = serviceUserId;

  const logs = await prisma.callLog.findMany({
    where,
    include,
    orderBy: { createdAt: 'desc' },
  });
  res.json(logs);
}
