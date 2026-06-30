import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const TEXT_FIELDS = [
  'likes', 'dislikes', 'lifeHistory', 'health', 'whatPeopleLike', 'relationships', 'goodDay', 'badDay',
] as const;

export async function getLikesDislikes(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const record = await prisma.likesDislikes.findUnique({ where: { serviceUserId } });
  res.json(record); // null if nothing recorded yet
}

export async function upsertLikesDislikes(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const data: Record<string, unknown> = { updatedById: req.user!.id };
  for (const f of TEXT_FIELDS) {
    if (f in req.body) {
      const v = req.body[f];
      data[f] = v == null || String(v).trim() === '' ? null : String(v);
    }
  }

  const record = await prisma.likesDislikes.upsert({
    where: { serviceUserId },
    create: { serviceUserId, ...data },
    update: data,
  });
  res.json(record);
}
