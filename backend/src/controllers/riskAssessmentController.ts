import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';
import { reviewedReviewDate } from '../lib/planReview';
import { logAudit } from '../lib/audit';

// Index for a client's risk assessments: which types exist and when each was
// last updated. Site-scoped for scoped users.
export async function listRiskAssessments(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = { ...relatedServiceUserScopeWhere(req.user) };
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  const rows = await prisma.riskAssessment.findMany({
    where,
    select: { serviceUserId: true, type: true, createdAt: true, updatedAt: true, data: true },
  });
  // When each assessment was last actually reviewed. A version is archived at
  // the moment somebody completes a review, so its date is the one fact here
  // that cannot go stale — unlike the seeded __paper date, which nothing in
  // the review flow ever moved, leaving reviewed assessments stuck on red.
  const versions = await prisma.riskAssessmentVersion.findMany({
    where: serviceUserId ? { serviceUserId: String(serviceUserId) } : {},
    select: { serviceUserId: true, type: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const lastReviewed = new Map<string, Date>();
  for (const v of versions) {
    const k = `${v.serviceUserId}__${v.type}`;
    if (!lastReviewed.has(k)) lastReviewed.set(k, v.createdAt);
  }
  // Surface the "held on paper" essentials (stored under the reserved __paper
  // key) so the list can show an on-file badge and the review-due date.
  const out = rows.map((r) => {
    let paper: { onFile?: boolean; completedDate?: string; reviewDate?: string } | null = null;
    try { const d = JSON.parse(r.data); if (d && typeof d.__paper === 'object') paper = d.__paper; } catch { /* ignore */ }
    const { data, ...rest } = r;
    const paperDue = paper?.reviewDate ? new Date(paper.reviewDate) : null;
    const due = reviewedReviewDate(
      paperDue && !isNaN(paperDue.getTime()) ? paperDue : null,
      lastReviewed.get(`${r.serviceUserId}__${r.type}`) ?? null,
    );
    return {
      ...rest,
      onFile: !!paper?.onFile,
      completedDate: paper?.completedDate || null,
      reviewDate: due ? due.toISOString() : null,
    };
  });
  res.json(out);
}

// A single assessment by client + type — null if not started yet.
export async function getRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });
  const ra = await prisma.riskAssessment.findUnique({
    where: { serviceUserId_type: { serviceUserId, type } },
  });
  res.json(ra); // null if not started
}

export async function upsertRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  // The whole assessment is stored as a JSON blob keyed by item id.
  let dataStr = '{}';
  if (req.body.data !== undefined) {
    const raw = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    try {
      JSON.parse(raw); // validate
      dataStr = raw;
    } catch {
      return res.status(400).json({ error: 'data must be valid JSON' });
    }
  }

  const ra = await prisma.riskAssessment.upsert({
    where: { serviceUserId_type: { serviceUserId, type } },
    create: { serviceUserId, type, data: dataStr, updatedById: req.user!.id },
    update: { data: dataStr, updatedById: req.user!.id },
  });
  res.json(ra);
}

/**
 * Type up a risk assessment that already exists on paper.
 *
 * A separate route from the editor's PUT, on its own capability, because the
 * two are different acts. The editor saves an assessment somebody is making
 * now; this one copies an assessment somebody made years ago, from a signed
 * form, so the office can work from the software instead of the filing
 * cabinet.
 *
 * The rule that keeps it safe is that it only ever CREATES. If an assessment
 * of this type is already in Caremid the route refuses and says so: nobody
 * holding this capability can overwrite the risks a carer is working to, and
 * the worst it can do is add a record a person then has to read.
 *
 * It also refuses to leave the record undated. A transcribed assessment that
 * looks like it was written today is worse than no record, because it silences
 * the review-overdue check on a document that may be years old. The date on
 * the paper form is required, and it is the date that is stored.
 */

// Item answers are keyed `<sectionId>__<index>` by the shared form schema, and
// __paper is the reserved slot for the paper original's details.
const ITEM_KEY = /^[a-z][a-z0-9_]*__\d{1,3}$/;
const LEVELS = ['', 'LOW', 'MED', 'HIGH'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function recordPaperRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  const su = await prisma.serviceUser.findUnique({
    where: { id: serviceUserId },
    select: { firstName: true, lastName: true },
  });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  const existing = await prisma.riskAssessment.findUnique({
    where: { serviceUserId_type: { serviceUserId, type } },
    select: { updatedAt: true },
  });
  if (existing) {
    return res.status(409).json({
      error:
        `${su.firstName} ${su.lastName} already has a ${type} risk assessment in Caremid ` +
        `(last updated ${existing.updatedAt.toISOString().slice(0, 10)}). This route only creates one that ` +
        'is not there yet - edit the existing assessment in the app if it needs changing.',
    });
  }

  const { assessor, completedDate, reviewDate, source } = req.body as Record<string, unknown>;
  const who = str(assessor, 120).trim();
  const completed = str(completedDate, 10).trim();
  const from = str(source, 200).trim();
  if (!who) return res.status(400).json({ error: 'assessor is required - who signed the paper form.' });
  if (!ISO_DATE.test(completed)) {
    return res.status(400).json({ error: 'completedDate is required, as yyyy-mm-dd, from the paper form.' });
  }
  if (!from) return res.status(400).json({ error: 'source is required - name the paper form this came from.' });
  const review = str(reviewDate, 10).trim();
  if (review && !ISO_DATE.test(review)) {
    return res.status(400).json({ error: 'reviewDate must be yyyy-mm-dd.' });
  }

  const answers = req.body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers must be an object keyed by form item.' });
  }
  const entries = Object.entries(answers as Record<string, unknown>);
  if (!entries.length) return res.status(400).json({ error: 'answers is empty.' });
  if (entries.length > 400) return res.status(400).json({ error: 'answers has more than 400 items.' });

  // Structural validation only. Whether an answer belongs to the question it
  // is filed under is a question about the form schema, which lives in the
  // apps; what the server can guarantee is that nothing malformed is stored
  // and that no reserved key is written by hand.
  const data: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!ITEM_KEY.test(key)) {
      return res.status(400).json({ error: `"${key}" is not a form item key (expected e.g. sec3__9).` });
    }
    if (typeof value === 'string') {
      data[key] = value.slice(0, 2000);
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return res.status(400).json({ error: `"${key}" must be text or { level, comment, action }.` });
    }
    const v = value as Record<string, unknown>;
    const level = String(v.level ?? '').toUpperCase();
    if (!LEVELS.includes(level)) {
      return res.status(400).json({ error: `"${key}" has level "${v.level}" - use LOW, MED, HIGH, or leave it blank.` });
    }
    data[key] = { level, comment: str(v.comment, 1000), action: str(v.action, 1000) };
  }

  // The paper original's details, in the slot the apps already read for the
  // on-file badge and the review-due date. onFile stays false: the content is
  // in Caremid now, and claiming a scan is attached when none is would be a
  // worse record than none.
  data.__paper = { onFile: false, assessor: who, completedDate: completed, ...(review ? { reviewDate: review } : {}) };

  const ra = await prisma.riskAssessment.create({
    data: { serviceUserId, type, data: JSON.stringify(data), updatedById: req.user!.id },
  });
  await logAudit(
    req,
    'RISK_ASSESSMENT_TYPED_FROM_PAPER',
    `${su.firstName} ${su.lastName}`,
    `${type}, completed ${completed} by ${who}, ${entries.length} answers, from ${from}`,
  );
  res.status(201).json({ id: ra.id, type: ra.type, answers: entries.length, completedDate: completed });
}

export async function deleteRiskAssessment(req: AuthRequest, res: Response) {
  const { serviceUserId, type } = req.params;
  // deleteMany so it's a no-op (not a 404) if never started.
  await prisma.riskAssessment.deleteMany({ where: { serviceUserId, type } });
  res.json({ ok: true });
}
