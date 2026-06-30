import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ServiceUserStatus } from '../constants';

const include = {
  preferredCaregivers: { select: { id: true, firstName: true, lastName: true } },
  site: { select: { id: true, name: true, color: true } },
};

export async function listServiceUsers(req: AuthRequest, res: Response) {
  const { search, active, siteId, status } = req.query;
  const where: Record<string, unknown> = {};
  if (active !== undefined) where.active = active === 'true';
  if (siteId) where.siteId = siteId;
  if (status) where.status = String(status);

  if (search) {
    const term = String(search);
    where.OR = [
      { firstName: { contains: term } },
      { lastName: { contains: term } },
      { postcode: { contains: term } },
    ];
  }

  const users = await prisma.serviceUser.findMany({
    where,
    include,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(users);
}

export async function getServiceUser(req: AuthRequest, res: Response) {
  const user = await prisma.serviceUser.findUnique({ where: { id: req.params.id }, include });
  if (!user) return res.status(404).json({ error: 'Service user not found' });
  res.json(user);
}

function buildData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const stringFields = [
    'firstName', 'lastName', 'nhsNumber', 'address', 'postcode', 'phone', 'email',
    'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation', 'careNotes',
    'gpName', 'gpPractice', 'gpPhone', 'gpAddress',
    'pharmacyName', 'pharmacyPhone', 'pharmacyAddress',
  ];
  for (const f of stringFields) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.dateOfBirth !== undefined) data.dateOfBirth = new Date(body.dateOfBirth as string);
  if (body.needsMedication !== undefined) data.needsMedication = !!body.needsMedication;
  if (body.needsMobility !== undefined) data.needsMobility = !!body.needsMobility;
  if (body.needsPersonalCare !== undefined) data.needsPersonalCare = !!body.needsPersonalCare;
  if (body.visitDuration !== undefined) data.visitDuration = Number(body.visitDuration) || 30;
  if (body.visits !== undefined) {
    const raw = typeof body.visits === 'string' ? body.visits : JSON.stringify(body.visits);
    try { JSON.parse(raw); data.visits = raw; } catch { /* ignore invalid */ }
  }
  if (body.active !== undefined) data.active = !!body.active;
  if (body.siteId !== undefined) data.siteId = body.siteId || null;
  if (body.status !== undefined && Object.values(ServiceUserStatus).includes(body.status as ServiceUserStatus)) {
    data.status = body.status;
  }
  return data;
}

export async function createServiceUser(req: AuthRequest, res: Response) {
  const { firstName, lastName, dateOfBirth, preferredCaregiverIds } = req.body;
  if (!firstName || !lastName || !dateOfBirth) {
    return res.status(400).json({ error: 'firstName, lastName, dateOfBirth required' });
  }

  const data = buildData(req.body);
  // firstName/lastName/dateOfBirth are required on create
  data.firstName = firstName;
  data.lastName = lastName;
  data.dateOfBirth = new Date(dateOfBirth);

  if (Array.isArray(preferredCaregiverIds)) {
    data.preferredCaregivers = { connect: preferredCaregiverIds.map((id: string) => ({ id })) };
  }

  const user = await prisma.serviceUser.create({ data: data as never, include });
  res.status(201).json(user);
}

export async function updateServiceUser(req: AuthRequest, res: Response) {
  const { preferredCaregiverIds } = req.body;
  const data = buildData(req.body);

  if (Array.isArray(preferredCaregiverIds)) {
    data.preferredCaregivers = { set: preferredCaregiverIds.map((id: string) => ({ id })) };
  }

  // Only bump statusUpdatedAt when the status is actually changing, so the
  // Schedule calendar can show status badges starting from this date onward
  // without retroactively flagging past shifts on every unrelated edit.
  if (data.status !== undefined) {
    const existing = await prisma.serviceUser.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (existing && existing.status !== data.status) data.statusUpdatedAt = new Date();
  }

  const user = await prisma.serviceUser.update({ where: { id: req.params.id }, data: data as never, include });
  res.json(user);
}

export async function deleteServiceUser(req: AuthRequest, res: Response) {
  await prisma.serviceUser.delete({ where: { id: req.params.id } });
  res.json({ message: 'Service user deleted' });
}
