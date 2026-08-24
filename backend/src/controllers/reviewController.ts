import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';

const include = {
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

// Adds whole months to a date (month-accurate, not 30-day approximation).
function addMonthsUtc(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export async function listReviews(req: AuthRequest, res: Response) {
  const serviceUserId = req.query.serviceUserId as string | undefined;
  const where: Record<string, unknown> = serviceUserId ? { serviceUserId } : {};
  Object.assign(where, relatedServiceUserScopeWhere(req.user));

  const reviews = await prisma.review.findMany({
    where,
    include,
    orderBy: { reviewDate: 'desc' },
  });
  res.json(reviews);
}

export async function getReview(req: AuthRequest, res: Response) {
  const review = await prisma.review.findUnique({ where: { id: req.params.id }, include });
  if (!review) return res.status(404).json({ error: 'Review not found' });
  res.json(review);
}

export async function createReview(req: AuthRequest, res: Response) {
  const { serviceUserId, type, reviewDate, nextReviewDate, assessorName, answers, otherInfo, outcomes, representativeName, phoneConsent, source } = req.body;
  if (!serviceUserId || !reviewDate) {
    return res.status(400).json({ error: 'serviceUserId and reviewDate are required' });
  }

  const review = await prisma.review.create({
    data: {
      serviceUserId,
      type: type === 'QUARTERLY' ? 'QUARTERLY' : 'SIX_WEEK',
      reviewDate: new Date(reviewDate),
      // Next review is 3 months on (for both the 6-week and quarterly reviews);
      // fall back to computing it if the client didn't send one.
      nextReviewDate: nextReviewDate ? new Date(nextReviewDate) : addMonthsUtc(new Date(reviewDate), 3),
      assessorName: assessorName || null,
      answers: answers ? JSON.stringify(answers) : '{}',
      otherInfo: otherInfo || null,
      outcomes: outcomes ? JSON.stringify(outcomes) : '[]',
      representativeName: representativeName || null,
      phoneConsent: !!phoneConsent,
      source: source === 'paper' ? 'paper' : 'form',
    },
    include,
  });
  res.status(201).json(review);
}

export async function updateReview(req: AuthRequest, res: Response) {
  const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  const { reviewDate, nextReviewDate, assessorName, answers, otherInfo, outcomes, representativeName, phoneConsent } = req.body;
  const data: Record<string, unknown> = {};
  if (reviewDate !== undefined) data.reviewDate = new Date(reviewDate);
  if (nextReviewDate !== undefined) data.nextReviewDate = nextReviewDate ? new Date(nextReviewDate) : null;
  if (assessorName !== undefined) data.assessorName = assessorName || null;
  if (answers !== undefined) data.answers = JSON.stringify(answers);
  if (otherInfo !== undefined) data.otherInfo = otherInfo || null;
  if (outcomes !== undefined) data.outcomes = JSON.stringify(outcomes);
  if (representativeName !== undefined) data.representativeName = representativeName || null;
  if (phoneConsent !== undefined) data.phoneConsent = !!phoneConsent;

  const review = await prisma.review.update({ where: { id: req.params.id }, data, include });
  res.json(review);
}

export async function deleteReview(req: AuthRequest, res: Response) {
  const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  await prisma.review.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
