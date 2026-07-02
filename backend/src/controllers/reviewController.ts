import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const include = {
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

export async function listReviews(req: AuthRequest, res: Response) {
  const serviceUserId = req.query.serviceUserId as string | undefined;
  const where = serviceUserId ? { serviceUserId } : {};

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
  const { serviceUserId, type, reviewDate, assessorName, answers, otherInfo, outcomes, representativeName, phoneConsent } = req.body;
  if (!serviceUserId || !reviewDate) {
    return res.status(400).json({ error: 'serviceUserId and reviewDate are required' });
  }

  const review = await prisma.review.create({
    data: {
      serviceUserId,
      type: type === 'QUARTERLY' ? 'QUARTERLY' : 'SIX_WEEK',
      reviewDate: new Date(reviewDate),
      assessorName: assessorName || null,
      answers: answers ? JSON.stringify(answers) : '{}',
      otherInfo: otherInfo || null,
      outcomes: outcomes ? JSON.stringify(outcomes) : '[]',
      representativeName: representativeName || null,
      phoneConsent: !!phoneConsent,
    },
    include,
  });
  res.status(201).json(review);
}

export async function updateReview(req: AuthRequest, res: Response) {
  const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  const { reviewDate, assessorName, answers, otherInfo, outcomes, representativeName, phoneConsent } = req.body;
  const data: Record<string, unknown> = {};
  if (reviewDate !== undefined) data.reviewDate = new Date(reviewDate);
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
