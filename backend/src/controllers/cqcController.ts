import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getTenant } from '../lib/tenantContext';

// Each automated check maps to a CQC key question and a quality statement /
// regulation, so a red/amber flag is defensible in an inspection.
type CheckStatus = 'red' | 'amber' | 'green' | 'info';
interface CheckItem { id: string; label: string; link?: string }
interface Check {
  id: string;
  title: string;
  statement: string;   // e.g. "Involving people to manage risks · Reg 12"
  status: CheckStatus;
  count: number;       // number failing (0 = all good)
  total: number;       // population size the check ran over
  detail: string;      // one-line human explanation
  items: CheckItem[];  // the failing records (capped)
}
interface KeyQuestionBlock { key: string; label: string; score: number; checks: Check[] }

const KEY_QUESTIONS: { key: string; label: string }[] = [
  { key: 'safe', label: 'Safe' },
  { key: 'effective', label: 'Effective' },
  { key: 'caring', label: 'Caring' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'wellled', label: 'Well-led' },
];

const CAP = 50; // max drill-down items returned per check
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

// green = 1, amber = 0.5, red = 0; info excluded. Percentage across a block.
function scoreOf(checks: Check[]): number {
  const scored = checks.filter((c) => c.status !== 'info');
  if (!scored.length) return 100;
  const pts = scored.reduce((s, c) => s + (c.status === 'green' ? 1 : c.status === 'amber' ? 0.5 : 0), 0);
  return Math.round((pts / scored.length) * 100);
}

export async function getReadiness(req: AuthRequest, res: Response) {
  // Active caseload (exclude discharged/deceased/inactive) and active care staff.
  const clients = await prisma.serviceUser.findMany({
    where: { active: true, status: { notIn: ['DISCHARGED', 'DECEASED'] } },
    select: { id: true, firstName: true, lastName: true, careType: true },
    orderBy: [{ lastName: 'asc' }],
  });
  const staff = await prisma.user.findMany({
    where: { active: true, role: { not: 'FAMILY_MEMBER' }, platformAdmin: false },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }],
  });
  const clientLink = (c: { id: string; firstName: string; lastName: string }): CheckItem => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, link: `/service-users/${c.id}` });
  const staffLink = (s: { id: string; firstName: string; lastName: string }): CheckItem => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, link: `/users/${s.id}` });

  // --- Load supporting data in parallel ---
  const [carePlans, riskRows, likes, reviews, supervisions, spotChecks, trainings, missedMedRows, unassigned] = await Promise.all([
    prisma.carePlan.findMany({ select: { serviceUserId: true, reviewDate: true } }),
    prisma.riskAssessment.findMany({ select: { serviceUserId: true, type: true } }),
    prisma.likesDislikes.findMany({ select: { serviceUserId: true } }),
    prisma.review.findMany({ select: { serviceUserId: true, nextReviewDate: true } }),
    prisma.supervision.findMany({ select: { userId: true, nextReviewDate: true } }),
    prisma.spotCheck.findMany({ select: { carerId: true, date: true } }),
    prisma.training.findMany({ select: { userId: true, expiresAt: true } }),
    prisma.medAdministration.findMany({ where: { status: 'MISSED', scheduledFor: { gte: daysAgo(30) } }, select: { serviceUserId: true } }),
    prisma.shift.count({ where: { userId: null, status: 'SCHEDULED', date: { gte: now(), lte: daysAhead(7) } } }),
  ]);

  const carePlanBy = new Map(carePlans.map((c) => [c.serviceUserId, c]));
  const riskTypesBy = new Map<string, Set<string>>();
  for (const r of riskRows) { if (!riskTypesBy.has(r.serviceUserId)) riskTypesBy.set(r.serviceUserId, new Set()); riskTypesBy.get(r.serviceUserId)!.add(r.type); }
  const hasType = (id: string, type: string) => riskTypesBy.get(id)?.has(type) ?? false;
  const likesSet = new Set(likes.map((l) => l.serviceUserId));

  const latestReview = new Map<string, Date | null>();
  for (const r of reviews) {
    const cur = latestReview.get(r.serviceUserId);
    const d = r.nextReviewDate;
    if (d && (!cur || d > cur)) latestReview.set(r.serviceUserId, d);
    else if (!latestReview.has(r.serviceUserId)) latestReview.set(r.serviceUserId, cur ?? null);
  }
  const latestSup = new Map<string, Date | null>();
  for (const s of supervisions) {
    const cur = latestSup.get(s.userId);
    if (s.nextReviewDate && (!cur || s.nextReviewDate > cur)) latestSup.set(s.userId, s.nextReviewDate);
    else if (!latestSup.has(s.userId)) latestSup.set(s.userId, cur ?? null);
  }
  const latestSpot = new Map<string, Date>();
  for (const s of spotChecks) { const cur = latestSpot.get(s.carerId); if (!cur || s.date > cur) latestSpot.set(s.carerId, s.date); }
  const expiredTrainingStaff = new Set(trainings.filter((t) => t.expiresAt && t.expiresAt < now()).map((t) => t.userId));

  // Build one check from a filter over clients.
  const clientCheck = (id: string, title: string, statement: string, fail: (c: typeof clients[number]) => boolean, redIfAny: boolean, detail: (n: number) => string, pop = clients): Check => {
    const failing = pop.filter(fail);
    const status: CheckStatus = failing.length === 0 ? 'green' : redIfAny ? 'red' : 'amber';
    return { id, title, statement, status, count: failing.length, total: pop.length, detail: detail(failing.length), items: failing.slice(0, CAP).map(clientLink) };
  };
  const staffCheck = (id: string, title: string, statement: string, fail: (s: typeof staff[number]) => boolean, redIfAny: boolean, detail: (n: number) => string): Check => {
    const failing = staff.filter(fail);
    const status: CheckStatus = failing.length === 0 ? 'green' : redIfAny ? 'red' : 'amber';
    return { id, title, statement, status, count: failing.length, total: staff.length, detail: detail(failing.length), items: failing.slice(0, CAP).map(staffLink) };
  };

  const slClients = clients.filter((c) => c.careType === 'SUPPORTED_LIVING');
  const missedMedClients = new Set(missedMedRows.map((m) => m.serviceUserId));

  const safe: Check[] = [
    clientCheck('risk_assessments', 'Risk assessments in place', 'Involving people to manage risks · Reg 12',
      (c) => (riskTypesBy.get(c.id)?.size ?? 0) === 0, true, (n) => n ? `${n} active client(s) have no risk assessment on record.` : 'Every active client has at least one risk assessment.'),
    {
      id: 'missed_meds', title: 'Medication administration', statement: 'Medicines optimisation · Reg 12',
      status: missedMedClients.size ? 'red' : 'green', count: missedMedClients.size, total: clients.length,
      detail: missedMedClients.size ? `Missed medications recorded for ${missedMedClients.size} client(s) in the last 30 days.` : 'No missed medications in the last 30 days.',
      items: [...missedMedClients].slice(0, CAP).map((id) => { const c = clients.find((x) => x.id === id); return c ? clientLink(c) : { id, label: 'Client' }; }),
    },
    staffCheck('training_expired', 'Mandatory training current', 'Safe and effective staffing · Reg 18',
      (s) => expiredTrainingStaff.has(s.id), true, (n) => n ? `${n} staff member(s) have expired training.` : 'No expired training on record.'),
  ];

  const effective: Check[] = [
    clientCheck('care_plan_missing', 'Care plan in place', 'Assessing needs · Reg 9',
      (c) => !carePlanBy.has(c.id), true, (n) => n ? `${n} active client(s) have no care plan.` : 'Every active client has a care plan.'),
    clientCheck('care_plan_review', 'Care plan reviews up to date', 'Assessing needs / Monitoring outcomes · Reg 9',
      (c) => { const p = carePlanBy.get(c.id); return !!p?.reviewDate && p.reviewDate < now(); }, false, (n) => n ? `${n} care plan review(s) are overdue.` : 'No overdue care plan reviews.'),
    clientCheck('consent_contract', 'Consent / contract of care', 'Consent to care and treatment · Reg 11',
      (c) => !hasType(c.id, 'CONTRACT_OF_CARE'), false, (n) => n ? `${n} active client(s) have no contract of care on file.` : 'Every active client has a contract of care.'),
    clientCheck('review_overdue', 'Service reviews up to date', 'Monitoring and improving outcomes · Reg 17',
      (c) => { const d = latestReview.get(c.id); return !!d && d < now(); }, false, (n) => n ? `${n} service review(s) are overdue.` : 'No overdue service reviews.'),
  ];

  const caring: Check[] = [
    clientCheck('one_page_profile', 'Person-centred profile', 'Treating people as individuals · Reg 9',
      (c) => !hasType(c.id, 'ONE_PAGE_PROFILE'), false, (n) => n ? `${n} active client(s) have no One-Page Profile.` : 'Every active client has a One-Page Profile.'),
    clientCheck('likes_dislikes', 'Likes & dislikes recorded', 'Independence, choice and control · Reg 9',
      (c) => !likesSet.has(c.id), false, (n) => n ? `${n} active client(s) have no likes & dislikes recorded.` : 'Likes & dislikes recorded for every active client.'),
  ];

  const responsive: Check[] = [
    clientCheck('sl_support_plan', 'Supported-living support plan', 'Person centred care · Reg 9',
      (c) => !hasType(c.id, 'SL_SUPPORT_PLAN'), false, (n) => n ? `${n} supported-living client(s) have no support plan.` : 'Every supported-living client has a support plan.', slClients),
    { id: 'complaints', title: 'Complaints log', statement: 'Listening to and involving people · Reg 16', status: 'info', count: 0, total: 0, detail: 'Not yet evidenced in the system — a complaints register is planned for Phase 2.', items: [] },
  ];

  const wellled: Check[] = [
    {
      id: 'unassigned_shifts', title: 'Upcoming visits covered', statement: 'Governance / staffing · Reg 17 & 18',
      status: unassigned > 0 ? 'amber' : 'green', count: unassigned, total: 0,
      detail: unassigned > 0 ? `${unassigned} visit(s) in the next 7 days have no carer assigned.` : 'All visits in the next 7 days are covered.',
      items: unassigned > 0 ? [{ id: 'schedule', label: `${unassigned} unassigned visit(s) — open the schedule`, link: '/schedule' }] : [],
    },
    staffCheck('supervision_overdue', 'Staff supervisions up to date', 'Safe and effective staffing · Reg 18',
      (s) => { const d = latestSup.get(s.id); return d === undefined || d === null || d < now(); }, true,
      (n) => n ? `${n} staff member(s) are overdue (or have no) supervision.` : 'All staff supervisions are up to date.'),
    staffCheck('spot_check_overdue', 'Spot checks up to date', 'Governance · Reg 17',
      (s) => { const d = latestSpot.get(s.id); return !d || d < daysAgo(180); }, false,
      (n) => n ? `${n} staff member(s) have had no spot check in the last 6 months.` : 'All staff have a recent spot check.'),
    { id: 'incidents', title: 'Accidents & incidents register', statement: 'Learning culture · Reg 12 & 17', status: 'info', count: 0, total: 0, detail: 'Not yet evidenced in the system — an incident register is planned for Phase 2.', items: [] },
  ];

  const blocks: Record<string, Check[]> = { safe, effective, caring, responsive, wellled };
  const keyQuestions: KeyQuestionBlock[] = KEY_QUESTIONS.map((kq) => ({ key: kq.key, label: kq.label, checks: blocks[kq.key], score: scoreOf(blocks[kq.key]) }));
  const overallScore = Math.round(keyQuestions.reduce((s, k) => s + k.score, 0) / keyQuestions.length);

  // Manual self-assessment (stored per company).
  const settings = await prisma.orgSettings.findFirst();
  let selfAssessment: Record<string, unknown> = {};
  if (settings?.cqcSelfAssessment) { try { selfAssessment = JSON.parse(settings.cqcSelfAssessment); } catch { selfAssessment = {}; } }

  res.json({ generatedAt: new Date().toISOString(), overallScore, keyQuestions, selfAssessment });
}

export async function saveSelfAssessment(req: AuthRequest, res: Response) {
  const companyId = getTenant()?.companyId;
  if (!companyId) return res.status(400).json({ error: 'No company in scope' });
  let json = '{}';
  const raw = (req.body as { selfAssessment?: unknown }).selfAssessment;
  if (raw !== undefined) {
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    try { JSON.parse(str); json = str; } catch { return res.status(400).json({ error: 'selfAssessment must be valid JSON' }); }
  }
  await prisma.orgSettings.upsert({ where: { companyId }, update: { cqcSelfAssessment: json }, create: { companyId, cqcSelfAssessment: json } });
  res.json({ ok: true });
}
