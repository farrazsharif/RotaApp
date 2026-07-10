import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';

// GET /api/notes — the office log, newest first.
export async function listNotes(_req: AuthRequest, res: Response) {
  const notes = await prisma.officeNote.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(notes);
}

// POST /api/notes — add an update.
export async function createNote(req: AuthRequest, res: Response) {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Note is empty' });

  const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  const note = await prisma.officeNote.create({
    data: { body, authorId: req.user!.id, authorName: author ? `${author.firstName} ${author.lastName}` : null },
  });
  res.status(201).json(note);
}

// DELETE /api/notes/:id — the author or an admin may remove a note.
export async function deleteNote(req: AuthRequest, res: Response) {
  const note = await prisma.officeNote.findUnique({ where: { id: req.params.id } });
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.authorId !== req.user!.id && req.user!.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only the author or an admin can delete this note' });
  }
  await prisma.officeNote.delete({ where: { id: note.id } });
  res.json({ message: 'Deleted' });
}
