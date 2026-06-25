import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const include = {
  user: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  shift: {
    select: {
      id: true, date: true, startTime: true, endTime: true, visitName: true,
      // Needed so the UI can show the carer's actual clock in/out times
      // for the visit rather than the scheduled visit window.
      clockRecords: { select: { userId: true, clockIn: true, clockOut: true } },
    },
  },
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

export async function updateCallLog(req: AuthRequest, res: Response) {
  const { note } = req.body;
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  const log = await prisma.callLog.update({
    where: { id: req.params.id },
    data: { note: String(note).trim() },
    include,
  });
  res.json(log);
}

export async function deleteCallLog(req: AuthRequest, res: Response) {
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  await prisma.callLog.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
