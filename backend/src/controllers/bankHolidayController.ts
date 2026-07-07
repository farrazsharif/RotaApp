import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listBankHolidays(_req: AuthRequest, res: Response) {
  const holidays = await prisma.bankHoliday.findMany({ orderBy: { date: 'asc' } });
  res.json(holidays);
}

export async function createBankHoliday(req: AuthRequest, res: Response) {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'date and name are required' });

  // Normalise to midnight UTC so it matches how visit dates are compared.
  const day = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
  if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date' });

  const existing = await prisma.bankHoliday.findUnique({ where: { date: day } });
  if (existing) return res.status(409).json({ error: 'That date is already a bank holiday' });

  const holiday = await prisma.bankHoliday.create({ data: { date: day, name } });
  res.status(201).json(holiday);
}

export async function deleteBankHoliday(req: AuthRequest, res: Response) {
  await prisma.bankHoliday.delete({ where: { id: req.params.id } });
  res.json({ message: 'Bank holiday removed' });
}
