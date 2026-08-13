import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listAudit(req: AuthRequest, res: Response) {
  const { from, to, q } = req.query as { from?: string; to?: string; q?: string };
  const where: Record<string, unknown> = {};

  // Date range (inclusive of the whole `to` day). Records are never deleted, so
  // filtering by date lets you retrieve history far older than the default page.
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) { const end = new Date(to); end.setUTCDate(end.getUTCDate() + 1); range.lt = end; }
    where.createdAt = range;
  }

  // Free-text search across the readable fields.
  const term = (q || '').trim();
  if (term) {
    where.OR = [
      { target: { contains: term, mode: 'insensitive' } },
      { details: { contains: term, mode: 'insensitive' } },
      { actorName: { contains: term, mode: 'insensitive' } },
      { action: { contains: term, mode: 'insensitive' } },
    ];
  }

  // With a filter applied, return everything that matches (up to a high cap);
  // unfiltered, keep the fast recent-200 default.
  const hasFilter = !!(from || to || term);
  const take = Math.min(Number(req.query.limit) || (hasFilter ? 5000 : 200), 10000);
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take });

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
