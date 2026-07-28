import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { serviceUserInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';
import { emitToCompany } from '../lib/socket';
import { cancelAwayWindow, restoreAwayVisits } from '../lib/awayPeriods';

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

  // Only visits still SCHEDULED are cancelled — delivered/completed care is
  // never undone. Respite is silent (no carer push); hospital admissions notify.
  const patientName = `${su.firstName} ${su.lastName}`;
  const toCancel = await cancelAwayWindow(serviceUserId, startAt, endAt, {
    reason: note ? `Respite — ${note}` : 'Respite (client away)',
    patientName, awayLabel: 'on respite', notify: false,
  });

  const period = await prisma.respitePeriod.create({
    data: {
      serviceUserId, startAt, endAt, note: note || null, type: 'RESPITE',
      cancelledShiftIds: JSON.stringify(toCancel), cancelledCount: toCancel.length,
      createdById: req.user!.id, createdByName,
    },
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

// PATCH /api/respite/:id — move the return date (extend or reduce). Extending
// cancels the newly-covered visits; reducing (or an early discharge) restores
// the visits from the new date onward. For a hospital period carers are
// notified of the change; respite is silent.
export async function updateRespite(req: AuthRequest, res: Response) {
  const period = await prisma.respitePeriod.findUnique({ where: { id: req.params.id } });
  if (!period) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, period.serviceUserId))) return res.status(404).json({ error: 'Not found' });

  const newEnd = req.body.endAt ? new Date(req.body.endAt) : null;
  if (!newEnd || isNaN(newEnd.getTime())) return res.status(400).json({ error: 'A valid return date is required' });
  if (newEnd <= new Date(period.startAt)) return res.status(400).json({ error: 'The return date must be after the away-from date' });

  const su = await prisma.serviceUser.findUnique({
    where: { id: period.serviceUserId },
    select: { firstName: true, lastName: true, companyId: true },
  });
  const patientName = su ? `${su.firstName} ${su.lastName}` : 'the client';
  const isHospital = period.type === 'HOSPITAL';
  let ids: string[] = [];
  try { ids = JSON.parse(period.cancelledShiftIds || '[]'); } catch { ids = []; }

  const oldEnd = new Date(period.endAt);
  if (newEnd.getTime() > oldEnd.getTime()) {
    const added = await cancelAwayWindow(period.serviceUserId, oldEnd, newEnd, {
      reason: isHospital ? 'Hospital admission' : (period.note ? `Respite — ${period.note}` : 'Respite (client away)'),
      patientName, awayLabel: isHospital ? 'in hospital' : 'on respite', notify: isHospital,
    });
    ids = [...new Set([...ids, ...added])];
  } else if (newEnd.getTime() < oldEnd.getTime()) {
    const restored = await restoreAwayVisits(ids, newEnd, {
      patientName, resumeLabel: isHospital ? 'back from hospital' : 'back from respite', notify: isHospital,
    });
    const restoredSet = new Set(restored);
    ids = ids.filter((id) => !restoredSet.has(id));
  }

  const updated = await prisma.respitePeriod.update({
    where: { id: period.id },
    data: { endAt: newEnd, cancelledShiftIds: JSON.stringify(ids), cancelledCount: ids.length },
  });
  await logAudit(req, isHospital ? 'HOSPITAL_UPDATED' : 'RESPITE_UPDATED', patientName, `Return date → ${newEnd.toISOString().slice(0, 10)} · ${ids.length} visit(s) currently cancelled`);
  if (su?.companyId) emitToCompany(su.companyId, 'data:changed', { resource: '/api/shifts' });
  res.json(updated);
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
