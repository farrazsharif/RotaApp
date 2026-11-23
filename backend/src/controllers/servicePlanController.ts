import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';
import { servicePlanReviewDue } from '../lib/reviewDue';

// Lightweight index for the Service Plans list page: which clients already have
// a saved plan and when it was last updated. Site-scoped for scoped users.
export async function listServicePlans(req: AuthRequest, res: Response) {
  const plans = await prisma.personalServicePlan.findMany({
    where: { ...relatedServiceUserScopeWhere(req.user) },
    select: { serviceUserId: true, createdAt: true, updatedAt: true },
  });
  res.json(plans);
}

export async function deleteServicePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  // deleteMany so it's a no-op (not a 404) if no plan was ever started.
  await prisma.personalServicePlan.deleteMany({ where: { serviceUserId } });
  res.json({ ok: true });
}

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

  // Cache the review date alongside the blob so the dashboard never has to
  // open the blob to find it. See lib/reviewDue.ts.
  const tpl = await prisma.servicePlanTemplate.findFirst({ select: { sections: true } });
  const reviewDueAt = servicePlanReviewDue(dataStr, tpl?.sections ?? null);
  const plan = await prisma.personalServicePlan.upsert({
    where: { serviceUserId },
    create: { serviceUserId, data: dataStr, reviewDueAt, updatedById: req.user!.id },
    update: { data: dataStr, reviewDueAt, updatedById: req.user!.id },
  });
  res.json(plan);
}
