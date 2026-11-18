import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { serviceUserInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';

// Mental capacity assessments and legal authorities (MCA 2005, Reg 11).
//
// The five principles of the Act are enforced here rather than printed on a
// form, because a form that merely states them gets signed without being
// followed. Concretely, this controller will not record a finding that someone
// lacks capacity unless:
//
//   1. a decision is named - capacity is never assessed in general;
//   2. stage one is met - an impairment of, or disturbance in, the functioning
//      of the mind or brain. Without it the person has capacity, full stop;
//   3. at least one of the four functional abilities is answered "no" - and a
//      blank is not a no;
//   4. the practicable steps taken to help them decide are written down.
//
// Those four refusals are the difference between a capacity record and a
// record that merely asserts a conclusion.

export const CATEGORIES = [
  'PERSONAL_CARE',
  'MEDICATION',
  'FINANCES',
  'ACCOMMODATION',
  'HEALTHCARE',
  'CONTACT',
  'SAFETY',
  'TECHNOLOGY',
  'OTHER',
];

export const AUTHORITY_KINDS = [
  'LPA_HEALTH',
  'LPA_PROPERTY',
  'DEPUTY_HEALTH',
  'DEPUTY_PROPERTY',
  'APPOINTEE',
  'COURT_ORDER',
  'ADRT',
];

const OUTCOMES = ['HAS_CAPACITY', 'LACKS_CAPACITY'];

function clean(v: unknown, max = 8000): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, max);
}

function date(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Tri-state. A blank answer is not a "no", and only a real answer can support
// a finding that someone cannot make a decision.
function triState(v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return v === true || v === 'true';
}

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

const assessmentSelect = {
  id: true,
  serviceUserId: true,
  decision: true,
  category: true,
  assessedAt: true,
  impairment: true,
  impairmentDetail: true,
  stepsTaken: true,
  bestTimeOfDay: true,
  communicationUsed: true,
  canUnderstand: true,
  canRetain: true,
  canWeigh: true,
  canCommunicate: true,
  evidence: true,
  outcome: true,
  reviewDate: true,
  biOptions: true,
  biPersonsViews: true,
  biConsulted: true,
  biLeastRestrictive: true,
  biDecision: true,
  biDecidedAt: true,
  deprivationConcern: true,
  deprivationRaisedWith: true,
  deprivationRaisedAt: true,
  deprivationReference: true,
  createdAt: true,
  updatedAt: true,
  assessedBy: { select: { id: true, firstName: true, lastName: true } },
  biDecidedBy: { select: { id: true, firstName: true, lastName: true } },
};

// Everything a finding of "lacks capacity" has to rest on. Returns the reason
// it cannot stand, or null if it can.
function blocksLackingCapacity(a: {
  impairment: boolean;
  stepsTaken: string | null;
  canUnderstand: boolean | null;
  canRetain: boolean | null;
  canWeigh: boolean | null;
  canCommunicate: boolean | null;
}): string | null {
  if (!a.impairment) {
    return 'A person can only lack capacity where there is an impairment of, or disturbance in, the functioning of the mind or brain. Record stage one first.';
  }
  if (!a.stepsTaken) {
    return 'Record the steps taken to help this person make the decision themselves before concluding that they cannot.';
  }
  const answered = [a.canUnderstand, a.canRetain, a.canWeigh, a.canCommunicate];
  if (answered.every((x) => x === null)) {
    return 'Answer the four-part functional test before recording an outcome.';
  }
  if (!answered.some((x) => x === false)) {
    return 'A person lacks capacity only if they cannot do at least one of understand, retain, weigh or communicate. None is marked "no".';
  }
  return null;
}

// GET /api/capacity/:serviceUserId — assessments and authorities together.
// They answer one question between them: who decides, and on what basis.
export async function listForServiceUser(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const [assessments, authorities] = await Promise.all([
    prisma.capacityAssessment.findMany({
      where: { serviceUserId },
      orderBy: [{ assessedAt: 'desc' }],
      select: assessmentSelect,
    }),
    prisma.legalAuthority.findMany({
      where: { serviceUserId },
      orderBy: [{ kind: 'asc' }],
      include: { evidenceSeenBy: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  res.json({ assessments, authorities });
}

// POST /api/capacity/:serviceUserId
export async function createAssessment(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const b = req.body as Record<string, unknown>;
  // Without a named decision this is not a capacity assessment. It is the
  // blanket judgement the Act exists to prevent.
  const decision = clean(b.decision, 400);
  if (!decision) {
    return res.status(400).json({ error: 'Name the decision this assessment is about.' });
  }

  const row = await prisma.capacityAssessment.create({
    data: {
      serviceUserId,
      decision,
      category: oneOf(b.category, CATEGORIES, 'OTHER'),
      assessedById: req.user!.id,
      assessedAt: date(b.assessedAt) || new Date(),
    },
    select: assessmentSelect,
  });

  await logAudit(req, 'CAPACITY_ASSESSMENT_STARTED', row.id, `Capacity assessment started: ${decision}`);
  res.status(201).json(row);
}

// PATCH /api/capacity/assessment/:id
export async function updateAssessment(req: AuthRequest, res: Response) {
  const existing = await prisma.capacityAssessment.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  const text = (key: string, max = 8000) => {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  };
  const when = (key: string) => {
    const d = date(b[key]);
    if (d !== undefined) data[key] = d;
  };
  const tri = (key: string) => {
    const v = triState(b[key]);
    if (v !== undefined) data[key] = v;
  };

  text('decision', 400);
  text('impairmentDetail');
  text('stepsTaken');
  text('bestTimeOfDay', 200);
  text('communicationUsed');
  text('evidence');
  text('biOptions');
  text('biPersonsViews');
  text('biConsulted');
  text('biLeastRestrictive');
  text('biDecision');
  text('deprivationRaisedWith', 200);
  text('deprivationReference', 100);
  when('assessedAt');
  when('reviewDate');
  when('biDecidedAt');
  when('deprivationRaisedAt');
  tri('canUnderstand');
  tri('canRetain');
  tri('canWeigh');
  tri('canCommunicate');
  if (b.category !== undefined) data.category = oneOf(b.category, CATEGORIES, existing.category);
  if (b.impairment !== undefined) data.impairment = b.impairment === true;
  if (b.deprivationConcern !== undefined) data.deprivationConcern = b.deprivationConcern === true;

  if (b.outcome !== undefined) {
    const raw = clean(b.outcome, 20);
    const outcome = raw ? oneOf(raw, OUTCOMES, '') : null;
    if (raw && !outcome) return res.status(400).json({ error: 'Unknown outcome' });

    if (outcome === 'LACKS_CAPACITY') {
      const merged = {
        impairment: ('impairment' in data ? data.impairment : existing.impairment) as boolean,
        stepsTaken: ('stepsTaken' in data ? data.stepsTaken : existing.stepsTaken) as string | null,
        canUnderstand: ('canUnderstand' in data ? data.canUnderstand : existing.canUnderstand) as boolean | null,
        canRetain: ('canRetain' in data ? data.canRetain : existing.canRetain) as boolean | null,
        canWeigh: ('canWeigh' in data ? data.canWeigh : existing.canWeigh) as boolean | null,
        canCommunicate: ('canCommunicate' in data ? data.canCommunicate : existing.canCommunicate) as boolean | null,
      };
      const blocked = blocksLackingCapacity(merged);
      if (blocked) return res.status(400).json({ error: blocked });
    }
    data.outcome = outcome;
  }

  // A best-interest decision only exists where capacity is lacking. Recorded
  // against someone who has capacity it is not a best-interest decision, it is
  // a decision taken over their head.
  const finalOutcome = ('outcome' in data ? data.outcome : existing.outcome) as string | null;
  const biDecision = ('biDecision' in data ? data.biDecision : existing.biDecision) as string | null;
  if (biDecision && finalOutcome !== 'LACKS_CAPACITY') {
    return res.status(400).json({
      error: 'A best-interest decision can only be recorded where this assessment found the person lacks capacity for this decision.',
    });
  }
  // Stamp who made it, the first time one is written.
  if (biDecision && !existing.biDecision) {
    data.biDecidedById = req.user!.id;
    if (!('biDecidedAt' in data) && !existing.biDecidedAt) data.biDecidedAt = new Date();
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const row = await prisma.capacityAssessment.update({
    where: { id: existing.id },
    data,
    select: assessmentSelect,
  });

  if (data.outcome) {
    await logAudit(
      req,
      'CAPACITY_ASSESSMENT_COMPLETED',
      row.id,
      `${row.decision}: ${data.outcome === 'LACKS_CAPACITY' ? 'lacks capacity' : 'has capacity'}`,
    );
  }
  res.json(row);
}

// DELETE /api/capacity/assessment/:id — for one started in error. A completed
// assessment is a record of a decision taken about someone, so only an
// unfinished one can go.
export async function deleteAssessment(req: AuthRequest, res: Response) {
  const existing = await prisma.capacityAssessment.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (existing.outcome) {
    return res.status(400).json({
      error: 'This assessment has an outcome recorded and cannot be deleted. Start a new assessment if the decision has been revisited.',
    });
  }
  await prisma.capacityAssessment.delete({ where: { id: existing.id } });
  await logAudit(req, 'CAPACITY_ASSESSMENT_DELETED', existing.id, `Unfinished capacity assessment removed: ${existing.decision}`);
  res.json({ ok: true });
}

// --- Legal authorities -----------------------------------------------------

// POST /api/capacity/:serviceUserId/authority
export async function createAuthority(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const b = req.body as Record<string, unknown>;
  const kind = oneOf(b.kind, AUTHORITY_KINDS, '');
  if (!kind) return res.status(400).json({ error: 'Choose what kind of authority this is.' });

  const row = await prisma.legalAuthority.create({
    data: {
      serviceUserId,
      kind,
      holderName: clean(b.holderName, 200) || null,
      holderContact: clean(b.holderContact, 200) || null,
      registered: b.registered === true,
      reference: clean(b.reference, 100) || null,
      scope: clean(b.scope) || null,
      notes: clean(b.notes) || null,
    },
    include: { evidenceSeenBy: { select: { id: true, firstName: true, lastName: true } } },
  });

  await logAudit(req, 'LEGAL_AUTHORITY_ADDED', row.id, `${kind} recorded`);
  res.status(201).json(row);
}

// PATCH /api/capacity/authority/:id
export async function updateAuthority(req: AuthRequest, res: Response) {
  const existing = await prisma.legalAuthority.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, max] of [['holderName', 200], ['holderContact', 200], ['reference', 100], ['scope', 8000], ['notes', 8000]] as const) {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  }
  if (b.kind !== undefined) data.kind = oneOf(b.kind, AUTHORITY_KINDS, existing.kind);
  if (b.registered !== undefined) data.registered = b.registered === true;
  if (b.active !== undefined) data.active = b.active === true;

  // Seeing the document is an act by a person on a day, so it is stamped with
  // both rather than left as a tick anyone could have put there.
  if (b.evidenceSeen !== undefined) {
    const seen = b.evidenceSeen === true;
    data.evidenceSeen = seen;
    if (seen && !existing.evidenceSeen) {
      data.evidenceSeenAt = new Date();
      data.evidenceSeenById = req.user!.id;
    }
    if (!seen) {
      data.evidenceSeenAt = null;
      data.evidenceSeenById = null;
    }
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const row = await prisma.legalAuthority.update({
    where: { id: existing.id },
    data,
    include: { evidenceSeenBy: { select: { id: true, firstName: true, lastName: true } } },
  });
  await logAudit(req, 'LEGAL_AUTHORITY_UPDATED', row.id, `${row.kind} updated`);
  res.json(row);
}

// DELETE /api/capacity/authority/:id — for one added in error. An authority
// that has ended is marked inactive instead, so the history stays readable.
export async function deleteAuthority(req: AuthRequest, res: Response) {
  const existing = await prisma.legalAuthority.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  await prisma.legalAuthority.delete({ where: { id: existing.id } });
  await logAudit(req, 'LEGAL_AUTHORITY_DELETED', existing.id, `${existing.kind} removed`);
  res.json({ ok: true });
}
