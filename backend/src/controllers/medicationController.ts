import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { MedStatus } from '../constants';

function parseTimes(input: unknown): string {
  if (Array.isArray(input)) return JSON.stringify(input.filter((t) => typeof t === 'string'));
  if (typeof input === 'string') {
    // allow comma-separated "08:00, 20:00"
    const arr = input.split(',').map((s) => s.trim()).filter(Boolean);
    return JSON.stringify(arr);
  }
  return '[]';
}

const VALID_VIEWS = ['front', 'back', 'faceFront', 'faceSide'];

function parseApplicationSites(input: unknown): string {
  if (!Array.isArray(input)) return '[]';
  const sites = input
    .filter((p): p is { view: string; x: number; y: number } =>
      !!p && VALID_VIEWS.includes(p.view) && typeof p.x === 'number' && typeof p.y === 'number'
    )
    .map((p) => ({ view: p.view, x: p.x, y: p.y, label: typeof (p as { label?: unknown }).label === 'string' ? (p as { label?: string }).label : undefined }));
  return JSON.stringify(sites);
}

export async function listMedications(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  const meds = await prisma.medication.findMany({
    where: { serviceUserId: String(serviceUserId), active: true },
    orderBy: { name: 'asc' },
  });
  res.json(meds);
}

export async function createMedication(req: AuthRequest, res: Response) {
  const { serviceUserId, name, dose, route, instructions, times, startDate, endDate, applicationSites } = req.body;
  if (!serviceUserId || !name) return res.status(400).json({ error: 'serviceUserId and name required' });
  const med = await prisma.medication.create({
    data: {
      serviceUserId,
      name,
      dose: dose || null,
      route: route || null,
      instructions: instructions || null,
      times: parseTimes(times),
      applicationSites: parseApplicationSites(applicationSites),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  res.status(201).json(med);
}

export async function updateMedication(req: AuthRequest, res: Response) {
  const { name, dose, route, instructions, times, startDate, endDate, active, applicationSites } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (dose !== undefined) data.dose = dose || null;
  if (route !== undefined) data.route = route || null;
  if (instructions !== undefined) data.instructions = instructions || null;
  if (times !== undefined) data.times = parseTimes(times);
  if (applicationSites !== undefined) data.applicationSites = parseApplicationSites(applicationSites);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (active !== undefined) data.active = !!active;
  const med = await prisma.medication.update({ where: { id: req.params.id }, data });
  res.json(med);
}

export async function deleteMedication(req: AuthRequest, res: Response) {
  await prisma.medication.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ message: 'Medication discontinued' });
}

const adminInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  medication: { select: { id: true, name: true, dose: true, route: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

export async function listAdministrations(req: AuthRequest, res: Response) {
  const { serviceUserId, date, startDate, endDate, recent } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  if (date) {
    const [y, m, d] = String(date).split('-').map(Number);
    where.scheduledFor = { gte: new Date(y, m - 1, d, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59) };
  } else if (startDate || endDate) {
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
    include: adminInclude,
    orderBy: serviceUserId && date ? { scheduledFor: 'asc' } : { recordedAt: 'desc' },
    take: recent ? Number(recent) || 100 : undefined,
  });
  res.json(records);
}

export async function recordAdministration(req: AuthRequest, res: Response) {
  const { medicationId, serviceUserId, scheduledFor, status, note } = req.body;
  if (!medicationId || !serviceUserId || !scheduledFor || !status) {
    return res.status(400).json({ error: 'medicationId, serviceUserId, scheduledFor, status required' });
  }
  if (!Object.values(MedStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const when = new Date(scheduledFor);
  const record = await prisma.medAdministration.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    update: { status, note: note || null, userId: req.user!.id, recordedAt: new Date() },
    create: { medicationId, serviceUserId, scheduledFor: when, status, note: note || null, userId: req.user!.id },
    include: adminInclude,
  });
  res.status(201).json(record);
}
