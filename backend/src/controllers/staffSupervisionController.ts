import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// answers / observations are stored as JSON strings. Accept either a string or
// an object from the client and always persist a valid JSON string.
function asJson(value: unknown, fallback = '{}'): string {
  if (value === undefined) return fallback;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  try { JSON.parse(raw); return raw; } catch { return fallback; }
}

function buildData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const f of ['position', 'serviceUsers', 'assessorName', 'assessorSignature', 'staffSignature', 'source', 'note']) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.date !== undefined) {
    const d = new Date(body.date as string);
    data.date = d;
    // Next supervision is due 3 months after this one.
    data.nextReviewDate = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate());
  }
  // Optional explicit next-due override (a different cadence, or when seeding a
  // historic paper supervision) — wins over the auto +3 months above.
  if (body.nextReviewDate) {
    const n = new Date(body.nextReviewDate as string);
    if (!isNaN(n.getTime())) data.nextReviewDate = n;
  }
  if (body.answers !== undefined) data.answers = asJson(body.answers);
  if (body.observations !== undefined) data.observations = asJson(body.observations);
  return data;
}

export async function listSupervisions(req: AuthRequest, res: Response) {
  const { userId } = req.query;
  const where: Record<string, unknown> = {};
  if (userId) where.userId = String(userId);
  const items = await prisma.supervision.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  res.json(items);
}

export async function getSupervision(req: AuthRequest, res: Response) {
  const item = await prisma.supervision.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Supervision not found' });
  res.json(item);
}

export async function createSupervision(req: AuthRequest, res: Response) {
  const { userId, date } = req.body;
  if (!userId || !date) return res.status(400).json({ error: 'userId and date are required' });
  const data = buildData(req.body);
  data.userId = userId;
  data.date = new Date(date);
  const item = await prisma.supervision.create({ data: data as never });
  res.status(201).json(item);
}

export async function updateSupervision(req: AuthRequest, res: Response) {
  const existing = await prisma.supervision.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Supervision not found' });
  const item = await prisma.supervision.update({ where: { id: req.params.id }, data: buildData(req.body) as never });
  res.json(item);
}

export async function deleteSupervision(req: AuthRequest, res: Response) {
  await prisma.supervision.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
