import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Light list (no heavy snapshot payloads) of a client's completed reviews, newest first.
export async function listLikesDislikesVersions(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  const versions = await prisma.likesDislikesVersion.findMany({
    where: { serviceUserId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });
  res.json(versions);
}

// A single review with its full frozen snapshot of the Likes & Dislikes record.
export async function getLikesDislikesVersion(req: AuthRequest, res: Response) {
  const version = await prisma.likesDislikesVersion.findUnique({ where: { id: req.params.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });
  let data: unknown = {};
  try { data = JSON.parse(version.data); } catch { /* keep {} */ }
  res.json({ ...version, data });
}

// Create an immutable dated snapshot of the CURRENT stored Likes & Dislikes
// record. The audit record is built server-side from the stored row (never the
// client body) so it truly reflects what was saved at review time.
export async function createLikesDislikesVersion(req: AuthRequest, res: Response) {
  const { serviceUserId, label } = req.body as { serviceUserId?: string; label?: string };
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });

  const record = await prisma.likesDislikes.findUnique({ where: { serviceUserId } });
  if (!record) return res.status(404).json({ error: 'No likes & dislikes to archive yet' });

  // Freeze the whole stored record (all Likes & Dislikes fields) as the snapshot.
  const snapshot = {
    likes: record.likes,
    dislikes: record.dislikes,
    lifeHistory: record.lifeHistory,
    health: record.health,
    whatPeopleLike: record.whatPeopleLike,
    relationships: record.relationships,
    goodDay: record.goodDay,
    badDay: record.badDay,
    paperMeta: record.paperMeta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  // Likes & Dislikes has no top-level review date; when it's held on paper the
  // next-review date lives in paperMeta, so surface that on the version.
  let reviewDate: Date | null = null;
  try {
    const pm = record.paperMeta ? JSON.parse(record.paperMeta) : null;
    if (pm && typeof pm.reviewDate === 'string' && pm.reviewDate) {
      const d = new Date(pm.reviewDate);
      if (!isNaN(d.getTime())) reviewDate = d;
    }
  } catch { /* no usable paper review date */ }

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
  const createdByName = me ? `${me.firstName} ${me.lastName}`.trim() || me.email : (req.user!.email ?? 'Unknown');
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });

  const version = await prisma.likesDislikesVersion.create({
    data: {
      serviceUserId,
      data: JSON.stringify(snapshot),
      label: label?.trim() || null,
      reviewDate,
      createdById: req.user!.id,
      createdByName,
    },
    select: { id: true, label: true, reviewDate: true, createdByName: true, createdAt: true },
  });

  const who = su ? `${su.firstName} ${su.lastName}` : serviceUserId;
  await logAudit(req, 'LIKES_DISLIKES_REVIEWED', `Likes & Dislikes · ${who}`, `${version.label || 'Review'} completed`);

  res.status(201).json(version);
}
