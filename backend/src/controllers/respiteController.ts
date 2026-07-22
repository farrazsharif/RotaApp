import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { serviceUserInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';
import { emitToCompany } from '../lib/socket';

// Combine a shift's stored date (noon-anchored) with its "HH:MM" start time so
// the respite window's times of day are respected — a morning call before the
// "away from" time still happens; an evening one inside the window is cancelled.
function shiftStart(date: Date, startTime: string): Date {
  const d = new Date(date);
  const [h, m] = String(startTime || '00:00').split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0, 0);
}

// GET /api/respite?serviceUserId=… — a client's respite/away periods, newest first.
export async function listRespite(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!(await serviceUserInScope(req.user, serviceUserId))) return res.status(404).json({ error: 'Service user not found' });
  const periods = await prisma.respitePeriod.findMany({
    where: { serviceUserId },
    orderBy: [{ startAt: 'desc' }],
  });
  res.json(periods);
}

// POST /api/respite — start a respite/away period. Cancels the client's
// scheduled visits inside the window as non-chargeable (client is away).
export async function createRespite(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.body.serviceUserId || '');
  const startAt = req.body.startAt ? new Date(req.body.startAt) : null;
  const endAt = req.body.endAt ? new Date(req.body.endAt) : null;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!startAt || isNaN(startAt.getTime()) || !endAt || isNaN(endAt.getTime())) {
    return res.status(400).json({ error: 'Valid away-from and restart date/times are required' });
  }
  if (endAt <= startAt) return res.status(400).json({ error: 'The restart time must be after the away-from time' });
  if (!(await serviceUserInScope(req.user, serviceUserId))) return res.status(404).json({ error: 'Service user not found' });

  const su = await prisma.serviceUser.findUnique({
    where: { id: serviceUserId },
    select: { companyId: true, firstName: true, lastName: true },
  });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = author ? `${author.firstName} ${author.lastName}`.trim() || author.email : (req.user!.email ?? 'Unknown');

  // Candidate visits: fetch a day either side of the window, then filter by the
  // precise start datetime so time-of-day boundaries are honoured. Only visits
  // still SCHEDULED are cancelled — delivered/completed care is never undone.
  const dayBefore = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate() - 1, 0, 0, 0);
  const dayAfter = new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate() + 1, 23, 59, 59);
  const candidates = await prisma.shift.findMany({
    where: { serviceUserId, status: 'SCHEDULED', date: { gte: dayBefore, lte: dayAfter } },
    select: { id: true, date: true, startTime: true },
  });
  const toCancel = candidates
    .filter((s) => {
      const start = shiftStart(s.date, s.startTime);
      return start >= startAt && start < endAt;
    })
    .map((s) => s.id);

  if (toCancel.length > 0) {
    await prisma.shift.updateMany({
      where: { id: { in: toCancel } },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelBillable: false,
        cancelChargeType: null,
        cancelChargePercent: null,
        cancelChargeAmount: null,
        cancelReason: note ? `Respite — ${note}` : 'Respite (client away)',
      },
    });
  }

  const period = await prisma.respitePeriod.create({
    data: { serviceUserId, startAt, endAt, note: note || null, cancelledCount: toCancel.length, createdById: req.user!.id, createdByName },
  });

  await logAudit(
    req,
    'RESPITE_ADDED',
    `${su.firstName} ${su.lastName}`,
    `Away ${startAt.toISOString().slice(0, 16).replace('T', ' ')} → ${endAt.toISOString().slice(0, 16).replace('T', ' ')} · ${toCancel.length} visit(s) cancelled non-chargeable`,
  );

  // Nudge open schedules to refetch so the cancelled visits drop off the rota.
  if (su.companyId) emitToCompany(su.companyId, 'data:changed', { resource: '/api/shifts' });

  res.status(201).json(period);
}

// DELETE /api/respite/:id — remove a respite record. Does NOT automatically
// un-cancel the visits it cancelled (a manager re-adds visits deliberately).
export async function deleteRespite(req: AuthRequest, res: Response) {
  const period = await prisma.respitePeriod.findUnique({ where: { id: req.params.id } });
  if (!period) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, period.serviceUserId))) return res.status(404).json({ error: 'Not found' });

  const su = await prisma.serviceUser.findUnique({ where: { id: period.serviceUserId }, select: { firstName: true, lastName: true } });
  await prisma.respitePeriod.delete({ where: { id: period.id } });
  await logAudit(req, 'RESPITE_REMOVED', su ? `${su.firstName} ${su.lastName}` : period.serviceUserId, 'Respite period removed');
  res.json({ message: 'Deleted' });
}
