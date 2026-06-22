import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function getServicePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });
  const plan = await prisma.personalServicePlan.findUnique({ where: { serviceUserId } });
  res.json(plan); // null if not started
}

export async function upsertServicePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  // The whole assessment is stored as a JSON blob keyed by item id.
  let dataStr = '{}';
  if (req.body.data !== undefined) {
    const raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    try {
      JSON.parse(raw); // validate
      dataStr = raw;
    } catch {
      return res.status(400).json({ error: 'data must be valid JSON' });
    }
  }

  const plan = await prisma.personalServicePlan.upsert({
    where: { serviceUserId },
    create: { serviceUserId, data: dataStr, updatedById: req.user!.id },
    update: { data: dataStr, updatedById: req.user!.id },
  });
  res.json(plan);
}
