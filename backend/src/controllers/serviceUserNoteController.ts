import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { logAudit } from '../lib/audit';

const CATEGORIES = ['GENERAL', 'COUNCIL', 'SOCIAL_WORK', 'SAFEGUARDING', 'CONTACT'];

// GET /api/service-user-notes?serviceUserId=… — a client's office notes.
// Pinned notes float to the top, then newest first.
export async function listServiceUserNotes(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  const notes = await prisma.serviceUserNote.findMany({
    where: { serviceUserId },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(notes);
}

// POST /api/service-user-notes — add a note for a client.
export async function createServiceUserNote(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.body.serviceUserId || '');
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'GENERAL';
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!body) return res.status(400).json({ error: 'Note is empty' });

  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { id: true, firstName: true, lastName: true } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = author ? `${author.firstName} ${author.lastName}`.trim() || author.email : (req.user!.email ?? 'Unknown');

  const note = await prisma.serviceUserNote.create({
    data: { serviceUserId, category, body, pinned: !!req.body.pinned, createdById: req.user!.id, createdByName },
  });
  await logAudit(req, 'SERVICE_USER_NOTE_ADDED', `Note · ${su.firstName} ${su.lastName}`, `${category} note added`);
  res.status(201).json(note);
}

// PATCH /api/service-user-notes/:id — edit body/category or toggle pin.
export async function updateServiceUserNote(req: AuthRequest, res: Response) {
  const note = await prisma.serviceUserNote.findUnique({ where: { id: req.params.id } });
  if (!note) return res.status(404).json({ error: 'Not found' });

  const data: { body?: string; category?: string; pinned?: boolean } = {};
  if (typeof req.body.body === 'string') {
    const body = req.body.body.trim();
    if (!body) return res.status(400).json({ error: 'Note is empty' });
    data.body = body;
  }
  if (CATEGORIES.includes(req.body.category)) data.category = req.body.category;
  if (typeof req.body.pinned === 'boolean') data.pinned = req.body.pinned;

  const updated = await prisma.serviceUserNote.update({ where: { id: note.id }, data });
  res.json(updated);
}

// DELETE /api/service-user-notes/:id — the author or an admin may remove a note.
export async function deleteServiceUserNote(req: AuthRequest, res: Response) {
  const note = await prisma.serviceUserNote.findUnique({ where: { id: req.params.id } });
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.createdById !== req.user!.id && req.user!.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only the author or an admin can delete this note' });
  }
  await prisma.serviceUserNote.delete({ where: { id: note.id } });
  await logAudit(req, 'SERVICE_USER_NOTE_DELETED', `Note · ${note.serviceUserId}`, `${note.category} note removed`);
  res.json({ message: 'Deleted' });
}
