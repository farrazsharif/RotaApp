import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listAudit(req: AuthRequest, res: Response) {
  const take = Math.min(Number(req.query.limit) || 200, 500);
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });

  // Resolve each actor's current name from their id (actorName only ever stored
  // the email), so the log can show a readable name alongside the address —
  // works for historical entries too.
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))];
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  res.json(logs.map((l) => ({ ...l, actorFullName: l.actorId ? (nameById.get(l.actorId) ?? null) : null })));
}
