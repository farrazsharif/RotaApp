import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Editable text fields on the care plan.
const TEXT_FIELDS = [
  'tasksMorning', 'tasksLunch', 'tasksTea', 'tasksBed',
  'numberOfCarers', 'carePackageInfo', 'otherNotes',
] as const;

export async function getCarePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const plan = await prisma.carePlan.findUnique({ where: { serviceUserId } });
  res.json(plan); // null if no plan has been written yet
}

export async function upsertCarePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const data: Record<string, unknown> = { updatedById: req.user!.id };
  for (const f of TEXT_FIELDS) {
    if (f in req.body) {
      const v = req.body[f];
      data[f] = v == null || String(v).trim() === '' ? null : String(v);
    }
  }
  if ('reviewDate' in req.body) {
    data.reviewDate = req.body.reviewDate ? new Date(req.body.reviewDate) : null;
  }
  if ('schedule' in req.body) {
    const raw = typeof req.body.schedule === 'string' ? req.body.schedule : JSON.stringify(req.body.schedule);
    try {
      JSON.parse(raw);
      data.schedule = raw;
    } catch {
      return res.status(400).json({ error: 'schedule must be valid JSON' });
    }
  }

  const plan = await prisma.carePlan.upsert({
    where: { serviceUserId },
    create: { serviceUserId, ...data },
    update: data,
  });
  res.json(plan);
}
