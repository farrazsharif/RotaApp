import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Light list (no heavy snapshot payloads) of a client's signed versions, newest first.
export async function listServicePlanVersions(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  const versions = await prisma.servicePlanVersion.findMany({
    where: { serviceUserId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, signedByName: true, createdByName: true, createdAt: true },
  });
  res.json(versions);
}

// A single version with its full frozen snapshot (questions + answers).
export async function getServicePlanVersion(req: AuthRequest, res: Response) {
  const version = await prisma.servicePlanVersion.findUnique({ where: { id: req.params.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });
  let sections: unknown = [];
  let data: unknown = {};
  try { sections = JSON.parse(version.sections); } catch { /* keep [] */ }
  try { data = JSON.parse(version.data); } catch { /* keep {} */ }
  res.json({ ...version, sections, data });
}

// Create an immutable signed snapshot. The client sends the exact questions and
// answers shown at sign-off so the frozen record matches what was signed.
export async function createServicePlanVersion(req: AuthRequest, res: Response) {
  const { serviceUserId, sections, data, label, signedByName } = req.body as {
    serviceUserId?: string; sections?: unknown; data?: unknown; label?: string; signedByName?: string;
  };
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections must be an array' });

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = me ? `${me.firstName} ${me.lastName}`.trim() || me.email : (req.user!.email ?? 'Unknown');
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });

  const version = await prisma.servicePlanVersion.create({
    data: {
      serviceUserId,
      sections: JSON.stringify(sections),
      data: JSON.stringify(data ?? {}),
      label: label?.trim() || null,
      signedByName: signedByName?.trim() || null,
      createdById: req.user!.id,
      createdByName,
    },
    select: { id: true, label: true, signedByName: true, createdByName: true, createdAt: true },
  });

  const who = su ? `${su.firstName} ${su.lastName}` : serviceUserId;
  await logAudit(req, 'SERVICE_PLAN_SIGNED', `Service plan · ${who}`, `${version.label || 'Version'} finalised${version.signedByName ? `, signed by ${version.signedByName}` : ''}`);

  res.status(201).json(version);
}
