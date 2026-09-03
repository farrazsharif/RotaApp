import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';

export async function listTraining(req: AuthRequest, res: Response) {
  // Carers can only ever see their own training record; managers/admins can
  // view anyone's by passing ?userId=, or everyone's by omitting it.
  const isStaffSelf = req.user!.role === Role.EMPLOYEE;
  const userId = isStaffSelf ? req.user!.id : (req.query.userId as string | undefined);

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;

  const records = await prisma.training.findMany({
    where,
    orderBy: { date: 'desc' },
  });
  res.json(records);
}

export async function createTraining(req: AuthRequest, res: Response) {
  const { userId, course, date, expiresAt, accredited, description } = req.body;
  if (!userId || !course || !date) {
    return res.status(400).json({ error: 'userId, course, and date are required' });
  }

  const record = await prisma.training.create({
    data: {
      userId,
      course: String(course),
      date: new Date(date),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      accredited: !!accredited,
      description: description || null,
    },
  });
  res.status(201).json(record);
}

// Annual refresher — renews every course the staff member currently holds in
// one go: a fresh record per course dated the refresher day, expiring a year
// later, so they all read Valid again with next-year expiry dates. Keeps the
// history (new records, old ones stay) for the CQC audit trail.
export async function refreshTraining(req: AuthRequest, res: Response) {
  const { userId, date } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const when = date ? new Date(date) : new Date();
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date' });
  const expires = new Date(when);
  expires.setFullYear(expires.getFullYear() + 1);

  // The courses this person holds = the latest record per course name.
  const records = await prisma.training.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  const latestByCourse = new Map<string, (typeof records)[number]>();
  for (const r of records) if (!latestByCourse.has(r.course)) latestByCourse.set(r.course, r);

  if (latestByCourse.size === 0) {
    return res.status(400).json({ error: 'This staff member has no training courses to refresh yet. Add their courses first.' });
  }

  const created = await prisma.$transaction(
    [...latestByCourse.values()].map((r) =>
      prisma.training.create({
        data: {
          userId,
          course: r.course,
          date: when,
          expiresAt: expires,
          accredited: r.accredited,
          description: 'Annual refresher',
        },
      })
    )
  );
  res.status(201).json({ count: created.length, records: created });
}

export async function updateTraining(req: AuthRequest, res: Response) {
  const existing = await prisma.training.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Training record not found' });

  const { course, date, expiresAt, accredited, description } = req.body;
  const data: Record<string, unknown> = {};
  if (course !== undefined) data.course = String(course);
  if (date !== undefined) data.date = new Date(date);
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (accredited !== undefined) data.accredited = !!accredited;
  if (description !== undefined) data.description = description || null;

  const record = await prisma.training.update({ where: { id: req.params.id }, data });
  res.json(record);
}

export async function deleteTraining(req: AuthRequest, res: Response) {
  const existing = await prisma.training.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Training record not found' });

  await prisma.training.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
