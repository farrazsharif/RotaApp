import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';

export async function listImportantDates(req: AuthRequest, res: Response) {
  const isStaffSelf = req.user!.role === Role.EMPLOYEE;
  const userId = isStaffSelf ? req.user!.id : (req.query.userId as string | undefined);

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;

  const records = await prisma.importantDate.findMany({ where, orderBy: { date: 'asc' } });
  res.json(records);
}

export async function createImportantDate(req: AuthRequest, res: Response) {
  const { userId, label, date, notes } = req.body;
  if (!userId || !label || !date) {
    return res.status(400).json({ error: 'userId, label, and date are required' });
  }

  const record = await prisma.importantDate.create({
    data: { userId, label: String(label), date: new Date(date), notes: notes || null },
  });
  res.status(201).json(record);
}

export async function updateImportantDate(req: AuthRequest, res: Response) {
  const existing = await prisma.importantDate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  const { label, date, notes } = req.body;
  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = String(label);
  if (date !== undefined) data.date = new Date(date);
  if (notes !== undefined) data.notes = notes || null;

  const record = await prisma.importantDate.update({ where: { id: req.params.id }, data });
  res.json(record);
}

export async function deleteImportantDate(req: AuthRequest, res: Response) {
  const existing = await prisma.importantDate.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  await prisma.importantDate.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
