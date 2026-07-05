import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listAudit(req: AuthRequest, res: Response) {
  const take = Math.min(Number(req.query.limit) || 200, 500);
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  res.json(logs);
}
