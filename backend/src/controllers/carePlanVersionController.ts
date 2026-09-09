import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Light list (no heavy snapshot payloads) of a client's completed reviews, newest first.
export async function listCarePlanVersions(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  const versions = await prisma.carePlanVersion.findMany({
    where: { serviceUserId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });
  res.json(versions);
}

// A single review with its full frozen snapshot of the care plan.
export async function getCarePlanVersion(req: AuthRequest, res: Response) {
  const version = await prisma.carePlanVersion.findUnique({ where: { id: req.params.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });
  let data: unknown = {};
  try { data = JSON.parse(version.data); } catch { /* keep {} */ }
  res.json({ ...version, data });
}

// Create an immutable dated snapshot of the CURRENT stored care plan. The audit
// record is built server-side from the stored row (never the client body) so it
// truly reflects what was saved at review time.
export async function createCarePlanVersion(req: AuthRequest, res: Response) {
  const { serviceUserId, label } = req.body as { serviceUserId?: string; label?: string };
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });

  const plan = await prisma.carePlan.findUnique({ where: { serviceUserId } });
  if (!plan) return res.status(404).json({ error: 'No care plan to archive yet' });

  // Freeze the whole stored plan (all care-plan fields) as the snapshot.
  const snapshot = {
    schedule: plan.schedule,
    extraCalls: plan.extraCalls,
    tasksMorning: plan.tasksMorning,
    tasksLunch: plan.tasksLunch,
    tasksTea: plan.tasksTea,
    tasksBed: plan.tasksBed,
    numberOfCarers: plan.numberOfCarers,
    carePackageInfo: plan.carePackageInfo,
    otherNotes: plan.otherNotes,
    reviewDate: plan.reviewDate,
    summary: plan.summary,
    personalCare: plan.personalCare,
    mobility: plan.mobility,
    nutrition: plan.nutrition,
    continence: plan.continence,
    medication: plan.medication,
    communication: plan.communication,
    mentalHealth: plan.mentalHealth,
    social: plan.social,
    dailyRoutine: plan.dailyRoutine,
    risks: plan.risks,
    goals: plan.goals,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = me ? `${me.firstName} ${me.lastName}`.trim() || me.email : (req.user!.email ?? 'Unknown');
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });

  const version = await prisma.carePlanVersion.create({
    data: {
      serviceUserId,
      data: JSON.stringify(snapshot),
      label: label?.trim() || null,
      reviewDate: plan.reviewDate,
      createdById: req.user!.id,
      createdByName,
    },
    select: { id: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });

  const who = su ? `${su.firstName} ${su.lastName}` : serviceUserId;
  await logAudit(req, 'CARE_PLAN_REVIEWED', `Care plan · ${who}`, `${version.label || 'Review'} completed`);

  res.status(201).json(version);
}
