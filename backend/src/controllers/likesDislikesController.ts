import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { reviewedReviewDate } from '../lib/planReview';
import { likesDislikesReviewDue } from '../lib/reviewDue';

const TEXT_FIELDS = [
  'likes', 'dislikes', 'lifeHistory', 'health', 'whatPeopleLike', 'relationships', 'goodDay', 'badDay',
] as const;

export async function getLikesDislikes(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const record = await prisma.likesDislikes.findUnique({ where: { serviceUserId } });
  if (!record) return res.json(null); // nothing recorded yet

  // The review date this record is really on. The seeded paperMeta date was
  // never moved by the review flow, so a record reviewed in Caremid stayed
  // pinned on red; a version is archived the moment a review is completed, so
  // its date is the one that cannot go stale. See lib/planReview.ts.
  const latest = await prisma.likesDislikesVersion.findFirst({
    where: { serviceUserId },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  let paperDue: Date | null = null;
  try {
    const pm = record.paperMeta ? (JSON.parse(record.paperMeta) as { reviewDate?: string }) : null;
    if (pm?.reviewDate) {
      const d = new Date(pm.reviewDate);
      if (!isNaN(d.getTime())) paperDue = d;
    }
  } catch { /* ignore */ }
  const due = reviewedReviewDate(paperDue, latest?.createdAt ?? null);
  res.json({ ...record, reviewDate: due ? due.toISOString() : null });
}

export async function upsertLikesDislikes(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.params;
  const serviceUser = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!serviceUser) return res.status(404).json({ error: 'Service user not found' });

  const data: Record<string, unknown> = { updatedById: req.user!.id };
  for (const f of TEXT_FIELDS) {
    if (f in req.body) {
      const v = req.body[f];
      data[f] = v == null || String(v).trim() === '' ? null : String(v);
    }
  }
  // Held-on-paper metadata (JSON). Stored verbatim after a validity check.
  if ('paperMeta' in req.body) {
    const raw = req.body.paperMeta;
    if (raw == null || raw === '') data.paperMeta = null;
    else {
      const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
      try { JSON.parse(str); data.paperMeta = str; } catch { return res.status(400).json({ error: 'paperMeta must be valid JSON' }); }
    }
  }

  // Cache the review date alongside the record. paperMeta is only present on
  // the request when it was sent, so the cache is only touched then - leaving
  // a plain text-field save from overwriting it with null.
  const withDue = 'paperMeta' in data
    ? { ...data, reviewDueAt: likesDislikesReviewDue(data.paperMeta as string | null) }
    : data;
  const record = await prisma.likesDislikes.upsert({
    where: { serviceUserId },
    create: { serviceUserId, ...withDue },
    update: withDue,
  });
  res.json(record);
}
