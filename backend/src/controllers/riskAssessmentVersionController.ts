import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Light list (no heavy snapshot payloads) of a client's completed reviews for
// one assessment type, newest first.
export async function listRiskAssessmentVersions(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  const type = String(req.query.type || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!type) return res.status(400).json({ error: 'type required' });
  const versions = await prisma.riskAssessmentVersion.findMany({
    where: { serviceUserId, type },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });
  res.json(versions);
}

// A single review with its full frozen snapshot of the assessment.
export async function getRiskAssessmentVersion(req: AuthRequest, res: Response) {
  const version = await prisma.riskAssessmentVersion.findUnique({ where: { id: req.params.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });
  let data: unknown = {};
  try { data = JSON.parse(version.data); } catch { /* keep {} */ }
  res.json({ ...version, data });
}

// Create an immutable dated snapshot of the CURRENT stored risk assessment for a
// given (serviceUser, type). The snapshot is built server-side from the stored
// row (never the client body) so it truly reflects what was saved at review time.
export async function createRiskAssessmentVersion(req: AuthRequest, res: Response) {
  const { serviceUserId, type, label } = req.body as { serviceUserId?: string; type?: string; label?: string };
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  if (!type) return res.status(400).json({ error: 'type required' });

  const ra = await prisma.riskAssessment.findUnique({
    where: { serviceUserId_type: { serviceUserId, type } },
  });
  if (!ra) return res.status(404).json({ error: 'No assessment to archive yet' });

  // The whole assessment is one JSON blob keyed by item id — freeze it verbatim.
  // When the assessment is held on paper the next-review date lives under the
  // reserved __paper key inside that blob, so surface it on the version.
  let reviewDate: Date | null = null;
  try {
    const d = JSON.parse(ra.data);
    const pm = d && typeof d.__paper === 'object' ? d.__paper : null;
    if (pm && typeof pm.reviewDate === 'string' && pm.reviewDate) {
      const dt = new Date(pm.reviewDate);
      if (!isNaN(dt.getTime())) reviewDate = dt;
    }
  } catch { /* no usable paper review date */ }

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = me ? `${me.firstName} ${me.lastName}`.trim() || me.email : (req.user!.email ?? 'Unknown');
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });

  const version = await prisma.riskAssessmentVersion.create({
    data: {
      serviceUserId,
      type,
      data: ra.data,
      label: label?.trim() || null,
      reviewDate,
      createdById: req.user!.id,
      createdByName,
    },
    select: { id: true, type: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });

  const who = su ? `${su.firstName} ${su.lastName}` : serviceUserId;
  await logAudit(req, 'RISK_ASSESSMENT_REVIEWED', `Risk Assessment (${type}) · ${who}`, `${version.label || 'Review'} completed`);

  res.status(201).json(version);
}
