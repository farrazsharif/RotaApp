import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';

// Index for a client's risk assessments: which types exist and when each was
// last updated. Site-scoped for scoped users.
export async function listRiskAssessments(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = { ...relatedServiceUserScopeWhere(req.user) };
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  const rows = await prisma.riskAssessment.findMany({
    where,
    select: { serviceUserId: true, type: true, createdAt: true, updatedAt: true },
  });
  res.json(rows);
}

// A single assessment by client + type — null if not started yet.
export async function getRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });
  const ra = await prisma.riskAssessment.findUnique({
    where: { serviceUserId_type: { serviceUserId, type } },
  });
  res.json(ra); // null if not started
}

export async function upsertRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
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

  const ra = await prisma.riskAssessment.upsert({
    where: { serviceUserId_type: { serviceUserId, type } },
    create: { serviceUserId, type, data: dataStr, updatedById: req.user!.id },
    update: { data: dataStr, updatedById: req.user!.id },
  });
  res.json(ra);
}

export async function deleteRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  // deleteMany so it's a no-op (not a 404) if never started.
  await prisma.riskAssessment.deleteMany({ where: { serviceUserId, type } });
  res.json({ ok: true });
}
