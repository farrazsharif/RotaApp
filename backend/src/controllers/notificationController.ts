import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listNotifications(req: AuthRequest, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
}

export async function markRead(req: AuthRequest, res: Response) {
  await prisma.notification.update({
    where: { id: req.params.id, userId: req.user!.id },
    data: { read: true },
  });
  res.json({ message: 'Marked as read' });
}

export async function markAllRead(req: AuthRequest, res: Response) {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, read: false },
    data: { read: true },
  });
  res.json({ message: 'All marked as read' });
}

export async function getUnreadCount(req: AuthRequest, res: Response) {
  const count = await prisma.notification.count({ where: { userId: req.user!.id, read: false } });
  res.json({ count });
}
