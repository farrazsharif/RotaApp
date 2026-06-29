import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const suInclude = {
  site: { select: { id: true, name: true, color: true } },
};

async function hasAccess(userId: string, serviceUserId: string) {
  const link = await prisma.familyLink.findUnique({
    where: { userId_serviceUserId: { userId, serviceUserId } },
  });
  return !!link;
}

export async function listMyServiceUsers(req: AuthRequest, res: Response) {
  const links = await prisma.familyLink.findMany({
    where: { userId: req.user!.id },
    include: { serviceUser: { include: suInclude } },
  });
  res.json(links.map((l) => ({ ...l.serviceUser, relation: l.relation })));
}

export async function getServiceUser(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  if (!(await hasAccess(req.user!.id, serviceUserId))) {
    return res.status(403).json({ error: 'You do not have access to this service user' });
  }
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, include: suInclude });
  if (!su) return res.status(404).json({ error: 'Service user not found' });
  res.json(su);
}

export async function getCarePlan(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  if (!(await hasAccess(req.user!.id, serviceUserId))) {
    return res.status(403).json({ error: 'You do not have access to this service user' });
  }
  const plan = await prisma.carePlan.findUnique({ where: { serviceUserId } });
  res.json(plan);
}

export async function listCallLogs(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  if (!(await hasAccess(req.user!.id, serviceUserId))) {
    return res.status(403).json({ error: 'You do not have access to this service user' });
  }
  const logs = await prisma.callLog.findMany({
    where: { serviceUserId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(logs);
}

export async function listMedications(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  if (!(await hasAccess(req.user!.id, serviceUserId))) {
    return res.status(403).json({ error: 'You do not have access to this service user' });
  }
  const meds = await prisma.medication.findMany({
    where: { serviceUserId, active: true },
    orderBy: { name: 'asc' },
  });
  res.json(meds);
}

export async function listAdministrations(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  if (!(await hasAccess(req.user!.id, serviceUserId))) {
    return res.status(403).json({ error: 'You do not have access to this service user' });
  }
  const { startDate, endDate } = req.query;
  const where: Record<string, unknown> = { serviceUserId };
  if (startDate || endDate) {
    const range: Record<string, Date> = {};
    if (startDate) {
      const [y, m, d] = String(startDate).split('-').map(Number);
      range.gte = new Date(y, m - 1, d, 0, 0, 0);
    }
    if (endDate) {
      const [y, m, d] = String(endDate).split('-').map(Number);
      range.lte = new Date(y, m - 1, d, 23, 59, 59);
    }
    where.scheduledFor = range;
  }
  const records = await prisma.medAdministration.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      medication: { select: { id: true, name: true, dose: true, route: true } },
    },
    orderBy: { scheduledFor: 'desc' },
    take: 200,
  });
  res.json(records);
}
