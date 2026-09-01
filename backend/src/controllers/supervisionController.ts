import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { isScoped, relatedServiceUserScopeWhere } from '../lib/scope';

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
export async function supervisionSummary(req: AuthRequest, res: Response) {
  const now = new Date();
  const soon = new Date(now.getTime() + SOON_DAYS * DAY);
  // Site-scoped managers only see clients/staff on their sites.
  const suScope = relatedServiceUserScopeWhere(req.user);
  const staffScope = isScoped(req.user) ? { sites: { some: { id: { in: req.user!.siteIds } } } } : {};

  const [reviews, carePlans, carers, checks, supervisions] = await Promise.all([
    prisma.review.findMany({
      where: { nextReviewDate: { not: null, lte: soon }, ...suScope },
      select: { id: true, serviceUserId: true, nextReviewDate: true, serviceUser: { select: { firstName: true, lastName: true } } },
      orderBy: { nextReviewDate: 'asc' },
    }),
    prisma.carePlan.findMany({
      where: { reviewDate: { not: null, lte: soon }, ...suScope },
      select: { serviceUserId: true, reviewDate: true, serviceUser: { select: { firstName: true, lastName: true } } },
      orderBy: { reviewDate: 'asc' },
    }),
    prisma.user.findMany({ where: { active: true, role: { notIn: [Role.ADMIN, Role.FAMILY_MEMBER] }, ...staffScope }, select: { id: true, firstName: true, lastName: true } }),
    prisma.spotCheck.findMany({ select: { id: true, carerId: true, date: true, observerName: true, answers: true, source: true }, orderBy: { date: 'desc' } }),
    prisma.supervision.findMany({ select: { userId: true, nextReviewDate: true, date: true }, orderBy: { date: 'desc' } }),
  ]);

  // A staff member's supervision is "due" once their latest one's next-review
  // date (auto-set to +3 months) has passed.
  const latestSupByUser = new Map<string, Date | null>();
  for (const s of supervisions) if (!latestSupByUser.has(s.userId)) latestSupByUser.set(s.userId, s.nextReviewDate);
  // Only count staff within scope (the carers list is already site-filtered).
  const supervisionsDueCount = carers.filter((c) => { const d = latestSupByUser.get(c.id); return !!d && d <= now; }).length;

  // Latest spot check per carer (checks are newest-first, so first wins).
  const latestByCarer = new Map<string, { id: string; date: Date; observerName: string | null; concerns: number; source: string }>();
  for (const c of checks) {
    if (!latestByCarer.has(c.carerId)) latestByCarer.set(c.carerId, { id: c.id, date: c.date, observerName: c.observerName, concerns: countConcerns(c.answers), source: c.source });
  }
  // One row per active carer: their last check, auto next-due date, and status.
  const spotRows = carers
    .map((c) => {
      const last = latestByCarer.get(c.id) ?? null;
      const nextDue = last ? addMonths(last.date, INTERVAL_MONTHS) : null;
      const due = !nextDue || nextDue <= now;
      return {
        carerId: c.id,
        carerName: `${c.firstName} ${c.lastName}`,
        lastCheck: last?.date ?? null,
        lastCheckId: last?.id ?? null,
        lastSource: last?.source ?? null,
        observerName: last?.observerName ?? null,
        concerns: last?.concerns ?? null,
        nextDue,
        due,
      };
    })
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1; // due first
      return (a.nextDue?.getTime() ?? 0) - (b.nextDue?.getTime() ?? 0); // then soonest next-due
    });

  res.json({
    intervalMonths: INTERVAL_MONTHS,
    supervisions: { dueCount: supervisionsDueCount },
    spotChecks: { dueCount: spotRows.filter((r) => r.due).length, rows: spotRows },
    reviews: {
      dueCount: reviews.length,
      items: reviews.map((r) => ({ id: r.id, serviceUserId: r.serviceUserId, serviceUserName: `${r.serviceUser.firstName} ${r.serviceUser.lastName}`, dueDate: r.nextReviewDate, overdue: !!r.nextReviewDate && r.nextReviewDate < now })),
    },
    risk: {
      dueCount: carePlans.length,
      items: carePlans.map((c) => ({ serviceUserId: c.serviceUserId, serviceUserName: `${c.serviceUser.firstName} ${c.serviceUser.lastName}`, dueDate: c.reviewDate, overdue: !!c.reviewDate && c.reviewDate < now })),
    },
  });
}

export async function listSpotChecks(req: AuthRequest, res: Response) {
  const { carerId } = req.query;
  const where: Record<string, unknown> = {};
  if (typeof carerId === 'string') where.carerId = carerId;
  // Site-scoped managers only see spot checks for carers on their sites.
  if (isScoped(req.user)) where.carer = { sites: { some: { id: { in: req.user!.siteIds } } } };
  const items = await prisma.spotCheck.findMany({ where, orderBy: { date: 'desc' }, select: spotCheckSelect });
  res.json(items);
}

export async function getSpotCheck(req: AuthRequest, res: Response) {
  const s = await prisma.spotCheck.findUnique({ where: { id: req.params.id }, select: spotCheckSelect });
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
}

export async function createSpotCheck(req: AuthRequest, res: Response) {
  const { carerId, serviceUserId, date, time, location, answers, generalComments, observerName, observerSignature, source } = req.body;
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
      source: source === 'paper' ? 'paper' : 'form',
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
