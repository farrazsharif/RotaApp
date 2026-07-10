import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';

// How often each active carer should be spot-checked. Constant for Phase 1;
// can move to an org setting later.
const INTERVAL_MONTHS = 3;
// A review/risk assessment counts as "due" once it's within this many days.
const SOON_DAYS = 30;
const DAY = 86_400_000;

// Adds whole months to a date (month-accurate, not a 30-day approximation).
function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

// Counts "No" answers in a stored spot-check, as a rough concern indicator.
function countConcerns(answersJson: string): number {
  try {
    const a = JSON.parse(answersJson) as Record<string, { answer?: string }>;
    return Object.values(a).filter((v) => v && v.answer === 'NO').length;
  } catch {
    return 0;
  }
}

const spotCheckSelect = {
  id: true, carerId: true, serviceUserId: true, date: true, time: true, location: true,
  answers: true, generalComments: true, observerId: true, observerName: true, observerSignature: true, createdAt: true,
  carer: { select: { firstName: true, lastName: true } },
  serviceUser: { select: { firstName: true, lastName: true } },
};

// GET /api/supervision/summary — everything the supervision dashboard needs.
export async function supervisionSummary(_req: AuthRequest, res: Response) {
  const now = new Date();
  const soon = new Date(now.getTime() + SOON_DAYS * DAY);

  const [reviews, carePlans, carers, checks, recent] = await Promise.all([
    prisma.review.findMany({
      where: { nextReviewDate: { not: null, lte: soon } },
      select: { id: true, serviceUserId: true, nextReviewDate: true, serviceUser: { select: { firstName: true, lastName: true } } },
      orderBy: { nextReviewDate: 'asc' },
    }),
    prisma.carePlan.findMany({
      where: { reviewDate: { not: null, lte: soon } },
      select: { serviceUserId: true, reviewDate: true, serviceUser: { select: { firstName: true, lastName: true } } },
      orderBy: { reviewDate: 'asc' },
    }),
    prisma.user.findMany({ where: { active: true, role: Role.EMPLOYEE }, select: { id: true, firstName: true, lastName: true } }),
    prisma.spotCheck.findMany({ select: { carerId: true, date: true }, orderBy: { date: 'desc' } }),
    prisma.spotCheck.findMany({
      orderBy: { date: 'desc' }, take: 6,
      select: { id: true, date: true, answers: true, carer: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  // Latest spot check per carer, then flag those overdue (or never checked).
  const lastByCarer = new Map<string, Date>();
  for (const c of checks) if (!lastByCarer.has(c.carerId)) lastByCarer.set(c.carerId, c.date);
  const spotItems = carers
    .map((c) => {
      const last = lastByCarer.get(c.id) ?? null;
      // Next check is due 3 months after the last one (or now, if never checked).
      const nextDue = last ? addMonths(last, INTERVAL_MONTHS) : null;
      const due = !nextDue || nextDue <= now;
      return { carerId: c.id, carerName: `${c.firstName} ${c.lastName}`, lastCheck: last, nextDue, due };
    })
    .filter((x) => x.due)
    .sort((a, b) => (a.lastCheck?.getTime() ?? 0) - (b.lastCheck?.getTime() ?? 0));

  res.json({
    intervalMonths: INTERVAL_MONTHS,
    spotChecks: { dueCount: spotItems.length, items: spotItems },
    reviews: {
      dueCount: reviews.length,
      items: reviews.map((r) => ({ id: r.id, serviceUserId: r.serviceUserId, serviceUserName: `${r.serviceUser.firstName} ${r.serviceUser.lastName}`, dueDate: r.nextReviewDate, overdue: !!r.nextReviewDate && r.nextReviewDate < now })),
    },
    risk: {
      dueCount: carePlans.length,
      items: carePlans.map((c) => ({ serviceUserId: c.serviceUserId, serviceUserName: `${c.serviceUser.firstName} ${c.serviceUser.lastName}`, dueDate: c.reviewDate, overdue: !!c.reviewDate && c.reviewDate < now })),
    },
    recentSpotChecks: recent.map((r) => ({ id: r.id, carerName: `${r.carer.firstName} ${r.carer.lastName}`, date: r.date, nextDue: addMonths(r.date, INTERVAL_MONTHS), concerns: countConcerns(r.answers) })),
  });
}

export async function listSpotChecks(req: AuthRequest, res: Response) {
  const { carerId } = req.query;
  const where: Record<string, unknown> = {};
  if (typeof carerId === 'string') where.carerId = carerId;
  const items = await prisma.spotCheck.findMany({ where, orderBy: { date: 'desc' }, select: spotCheckSelect });
  res.json(items);
}

export async function getSpotCheck(req: AuthRequest, res: Response) {
  const s = await prisma.spotCheck.findUnique({ where: { id: req.params.id }, select: spotCheckSelect });
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
}

export async function createSpotCheck(req: AuthRequest, res: Response) {
  const { carerId, serviceUserId, date, time, location, answers, generalComments, observerName, observerSignature } = req.body;
  if (!carerId || !date) return res.status(400).json({ error: 'carerId and date are required' });

  // Confirm the carer (and optional service user) belong to this company — the
  // scoped client returns null for anything outside it.
  const carer = await prisma.user.findUnique({ where: { id: carerId }, select: { id: true } });
  if (!carer) return res.status(404).json({ error: 'Carer not found' });
  if (serviceUserId) {
    const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { id: true } });
    if (!su) return res.status(404).json({ error: 'Service user not found' });
  }

  const created = await prisma.spotCheck.create({
    data: {
      carerId,
      serviceUserId: serviceUserId || null,
      date: new Date(date),
      time: time || null,
      location: location || null,
      answers: typeof answers === 'string' ? answers : JSON.stringify(answers || {}),
      generalComments: generalComments || null,
      observerId: req.user!.id,
      observerName: observerName || null,
      observerSignature: observerSignature || null,
    },
    select: spotCheckSelect,
  });
  res.status(201).json(created);
}

export async function deleteSpotCheck(req: AuthRequest, res: Response) {
  const s = await prisma.spotCheck.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!s) return res.status(404).json({ error: 'Not found' });
  await prisma.spotCheck.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
