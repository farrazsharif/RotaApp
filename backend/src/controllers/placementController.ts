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

// GET /api/placements/mine — the logged-in carer's current & upcoming placements
// (ending today or later, not cancelled), with the client's basic details.
export async function listMyPlacements(req: AuthRequest, res: Response) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rows = await prisma.placement.findMany({
    where: { carerId: req.user!.id, status: { not: 'CANCELLED' }, endDate: { gte: todayStart } },
    orderBy: [{ startDate: 'asc' }],
  });
  const suIds = [...new Set(rows.map((r) => r.serviceUserId))];
  const sus = suIds.length
    ? await prisma.serviceUser.findMany({
        where: { id: { in: suIds } },
        select: { id: true, firstName: true, lastName: true, address: true, postcode: true, phone: true },
      })
    : [];
  const suById = new Map(sus.map((s) => [s.id, s]));
  res.json(rows.map((r) => ({ ...r, serviceUser: suById.get(r.serviceUserId) || null })));
}

// The placement must belong to the calling carer (carer-app endpoints).
async function ownPlacement(req: AuthRequest) {
  const p = await prisma.placement.findUnique({ where: { id: req.params.id } });
  if (!p || p.carerId !== req.user!.id) return null;
  return p;
}

// GET /api/placements/:id/logs — the carer's daily diary entries for a placement.
export async function listPlacementLogs(req: AuthRequest, res: Response) {
  const p = await ownPlacement(req);
  if (!p) return res.status(404).json({ error: 'Placement not found' });
  const logs = await prisma.liveInDailyLog.findMany({
    where: { placementId: p.id },
    orderBy: [{ date: 'asc' }],
  });
  res.json(logs);
}

// PUT /api/placements/:id/logs/:date — upsert the day's diary entry. Manual
// upsert (findFirst + update/create) so tenant scoping stays correct.
export async function upsertPlacementLog(req: AuthRequest, res: Response) {
  const p = await ownPlacement(req);
  if (!p) return res.status(404).json({ error: 'Placement not found' });
  const date = dayStart(req.params.date);
  if (!date) return res.status(400).json({ error: 'Invalid date' });

  const start = new Date(p.startDate); const end = new Date(p.endDate);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (day < new Date(start.getFullYear(), start.getMonth(), start.getDate()) ||
      day > new Date(end.getFullYear(), end.getMonth(), end.getDate())) {
    return res.status(400).json({ error: 'That date is outside this placement' });
  }

  let dataStr = '{}';
  if (req.body.data !== undefined) {
    const raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    try { JSON.parse(raw); dataStr = raw; } catch { return res.status(400).json({ error: 'data must be valid JSON' }); }
  }

  const existing = await prisma.liveInDailyLog.findFirst({ where: { placementId: p.id, date } });
  const log = existing
    ? await prisma.liveInDailyLog.update({ where: { id: existing.id }, data: { data: dataStr } })
    : await prisma.liveInDailyLog.create({ data: { placementId: p.id, serviceUserId: p.serviceUserId, carerId: req.user!.id, date, data: dataStr } });
  res.json(log);
}
