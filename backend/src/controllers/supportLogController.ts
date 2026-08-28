import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

function normalizeDomains(raw: unknown): string {
  if (!Array.isArray(raw)) return '[]';
  const clean = [...new Set(raw.filter((k) => typeof k === 'string').map((k) => String(k).slice(0, 40)))].slice(0, 30);
  return JSON.stringify(clean);
}

// GET /api/support-log?shiftId= | ?serviceUserId= — running support log entries,
// oldest first (a diary through the shift). Tenant-scoped by the extension.
export async function listSupportLog(req: AuthRequest, res: Response) {
  const { shiftId, serviceUserId } = req.query as { shiftId?: string; serviceUserId?: string };
  if (!shiftId && !serviceUserId) return res.status(400).json({ error: 'shiftId or serviceUserId is required' });
  const where: Record<string, unknown> = {};
  if (shiftId) where.shiftId = String(shiftId);
  else if (serviceUserId) where.serviceUserId = String(serviceUserId);
  const entries = await prisma.supportLogEntry.findMany({ where, orderBy: [{ createdAt: 'asc' }] });
  res.json(entries);
}

// POST /api/support-log — add one timestamped entry. The assigned carer on the
// shift, or any manager/admin, may add.
export async function createSupportLogEntry(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, body, domains } = req.body as { serviceUserId?: string; shiftId?: string; body?: string; domains?: unknown };
  if (!serviceUserId || !body || !String(body).trim()) {
    return res.status(400).json({ error: 'serviceUserId and body are required' });
  }

  // Access: an EMPLOYEE must be assigned to the shift; managers/admins may add.
  if (req.user!.role === 'EMPLOYEE') {
    if (!shiftId) return res.status(403).json({ error: 'You can only log against your own visit' });
    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { userId: true, coverCarers: { select: { id: true } } } });
    const onCall = !!shift && (shift.userId === req.user!.id || shift.coverCarers.some((c) => c.id === req.user!.id));
    if (!onCall) return res.status(403).json({ error: 'You are not assigned to this visit' });
  }

  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  const entry = await prisma.supportLogEntry.create({
    data: {
      serviceUserId,
      shiftId: shiftId || null,
      userId: req.user!.id,
      userName: `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'Support worker',
      body: String(body).trim().slice(0, 4000),
      domains: normalizeDomains(domains),
    },
  });
  res.status(201).json(entry);
}
