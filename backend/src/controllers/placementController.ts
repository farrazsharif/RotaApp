import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const NIGHT_TYPES = ['SLEEP_IN', 'WAKING'];
const STATUSES = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

// Midnight (local) of a yyyy-MM-dd or ISO date — placements are whole days.
function dayStart(input: unknown): Date | null {
  if (!input) return null;
  const d = new Date(String(input));
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// GET /api/placements?from=&to= — live-in placements overlapping the window
// (or all upcoming if no window). Tenant-scoped by the Prisma extension.
export async function listPlacements(req: AuthRequest, res: Response) {
  const from = dayStart(req.query.from);
  const to = dayStart(req.query.to);
  const where: Record<string, unknown> = {};
  if (from && to) {
    // Overlap: starts on/before the window end AND ends on/after the window start.
    where.startDate = { lte: to };
    where.endDate = { gte: from };
  }
  const rows = await prisma.placement.findMany({
    where,
    orderBy: [{ startDate: 'asc' }],
  });
  res.json(rows);
}

export async function createPlacement(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const serviceUserId = String(b.serviceUserId || '');
  const carerId = String(b.carerId || '');
  const startDate = dayStart(b.startDate);
  const endDate = dayStart(b.endDate);

  if (!serviceUserId || !carerId) return res.status(400).json({ error: 'A client and a carer are required' });
  if (!startDate || !endDate) return res.status(400).json({ error: 'Valid start and end dates are required' });
  if (endDate < startDate) return res.status(400).json({ error: 'End date cannot be before the start date' });

  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  const placement = await prisma.placement.create({
    data: {
      serviceUserId,
      carerId,
      startDate,
      endDate,
      nightType: NIGHT_TYPES.includes(String(b.nightType)) ? String(b.nightType) : 'SLEEP_IN',
      status: STATUSES.includes(String(b.status)) ? String(b.status) : 'SCHEDULED',
      note: b.note ? String(b.note) : null,
      createdById: req.user!.id,
    },
  });
  await logAudit(req, 'PLACEMENT_CREATED', `${su.firstName} ${su.lastName}`);
  res.status(201).json(placement);
}

export async function updatePlacement(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.carerId !== undefined) data.carerId = String(b.carerId);
  if (b.startDate !== undefined) { const d = dayStart(b.startDate); if (d) data.startDate = d; }
  if (b.endDate !== undefined) { const d = dayStart(b.endDate); if (d) data.endDate = d; }
  if (b.nightType !== undefined) data.nightType = NIGHT_TYPES.includes(String(b.nightType)) ? String(b.nightType) : 'SLEEP_IN';
  if (b.status !== undefined) data.status = STATUSES.includes(String(b.status)) ? String(b.status) : 'SCHEDULED';
  if (b.note !== undefined) data.note = b.note ? String(b.note) : null;

  // Guard the ordering when both dates are supplied.
  const start = (data.startDate as Date) ?? null;
  const end = (data.endDate as Date) ?? null;
  if (start && end && end < start) return res.status(400).json({ error: 'End date cannot be before the start date' });

  const placement = await prisma.placement.update({ where: { id: req.params.id }, data });
  await logAudit(req, 'PLACEMENT_UPDATED', placement.id);
  res.json(placement);
}

export async function deletePlacement(req: AuthRequest, res: Response) {
  await prisma.placement.deleteMany({ where: { id: req.params.id } });
  await logAudit(req, 'PLACEMENT_DELETED', req.params.id);
  res.json({ ok: true });
}
