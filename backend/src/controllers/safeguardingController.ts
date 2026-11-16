import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isScoped, relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';

// The safeguarding log (Regulation 13).
//
// A concern is not an incident. An incident is something that happened on a
// visit; a concern is an allegation or suspicion of abuse or neglect, and what
// an inspector asks to see is the whole chain — what was raised, what was done
// that day, whether it went to the local authority and with what reference,
// whether CQC was notified, and what was learned at the end. Kept as free text
// in a note, none of that is answerable.
//
// Deliberately NOT restricted to clients on the system: a concern can be about
// a member of staff, a relative, or someone else in the house. A concern that
// cannot be recorded is a concern that goes unrecorded.

// The Care Act 2014 categories. One concern commonly spans several.
export const HARM_TYPES = [
  'PHYSICAL',
  'DOMESTIC',
  'SEXUAL',
  'PSYCHOLOGICAL',
  'FINANCIAL',
  'MODERN_SLAVERY',
  'DISCRIMINATORY',
  'ORGANISATIONAL',
  'NEGLECT',
  'SELF_NEGLECT',
];

const SOURCES = ['CARER', 'FAMILY', 'CLIENT', 'PROFESSIONAL', 'ANONYMOUS', 'OFFICE', 'OTHER'];
const STATUSES = ['OPEN', 'INVESTIGATING', 'REFERRED', 'CLOSED'];
// A whistleblowing disclosure is about the organisation, not a named person at
// risk, so it shares this record without the person and harm-type half of it.
const KINDS = ['CONCERN', 'WHISTLEBLOWING'];

const listSelect = {
  id: true,
  kind: true,
  confidential: true,
  serviceUserId: true,
  personAtRisk: true,
  source: true,
  raisedByName: true,
  occurredAt: true,
  raisedAt: true,
  harmTypes: true,
  description: true,
  status: true,
  referredToLA: true,
  laReference: true,
  cqcNotified: true,
  policeInformed: true,
  closedAt: true,
  createdAt: true,
  raisedBy: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  staffInvolved: { select: { id: true, firstName: true, lastName: true } },
};

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

function harmList(v: unknown): string {
  if (!Array.isArray(v)) return '[]';
  return JSON.stringify(v.filter((h) => typeof h === 'string' && HARM_TYPES.includes(h)));
}

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

// GET /api/safeguarding
export async function listConcerns(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};

  // A site-scoped manager sees concerns about their own clients, plus any with
  // no client attached that they raised — otherwise a concern about a member of
  // staff would disappear the moment it was filed.
  if (isScoped(req.user)) {
    where.OR = [relatedServiceUserScopeWhere(req.user), { serviceUserId: null, raisedById: req.user!.id }];
  }
  where.kind = typeof req.query.kind === 'string' && KINDS.includes(req.query.kind) ? req.query.kind : 'CONCERN';
  if (typeof req.query.status === 'string' && STATUSES.includes(req.query.status)) {
    where.status = req.query.status;
  } else if (String(req.query.open) === 'true') {
    where.status = { not: 'CLOSED' };
  }

  const concerns = await prisma.safeguardingConcern.findMany({
    where,
    orderBy: [{ raisedAt: 'desc' }],
    take: 500,
    select: listSelect,
  });
  res.json(concerns);
}

// GET /api/safeguarding/:id
export async function getConcern(req: AuthRequest, res: Response) {
  const concern = await prisma.safeguardingConcern.findUnique({
    where: { id: req.params.id },
    select: {
      ...listSelect,
      immediateAction: true,
      laName: true,
      laReferralDate: true,
      cqcNotifiedDate: true,
      cqcReference: true,
      policeReference: true,
      outcome: true,
      lessonsLearned: true,
      attachments: true,
      updatedAt: true,
      closedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!concern) return res.status(404).json({ error: 'Not found' });
  res.json(concern);
}

// POST /api/safeguarding
export async function createConcern(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const description = clean(b.description);
  if (!description) return res.status(400).json({ error: 'Describe the concern.' });

  const kind = oneOf(b.kind, KINDS, 'CONCERN');
  const serviceUserId = clean(b.serviceUserId, 40) || null;
  const personAtRisk = clean(b.personAtRisk, 200) || null;
  // Only a safeguarding concern has a person at risk. A whistleblowing
  // disclosure is about practice, and demanding a name would be the reason it
  // never gets filed.
  if (kind === 'CONCERN' && !serviceUserId && !personAtRisk) {
    return res.status(400).json({ error: 'Say who is at risk — either a client or a name.' });
  }

  const occurredAt = date(b.occurredAt);
  const raisedAt = date(b.raisedAt);

  const concern = await prisma.safeguardingConcern.create({
    data: {
      kind,
      confidential: !!b.confidential,
      serviceUserId,
      personAtRisk,
      raisedById: req.user!.id,
      raisedByName: clean(b.raisedByName, 200) || null,
      source: oneOf(b.source, SOURCES, 'CARER'),
      occurredAt: occurredAt ?? null,
      raisedAt: raisedAt || new Date(),
      harmTypes: harmList(b.harmTypes),
      description,
      immediateAction: clean(b.immediateAction) || null,
      staffInvolvedId: clean(b.staffInvolvedId, 40) || null,
    },
    select: listSelect,
  });

  // Audited on creation, not only on close: when a concern was first recorded
  // is itself the question asked after the fact.
  await logAudit(
    req,
    kind === 'WHISTLEBLOWING' ? 'WHISTLEBLOWING_RAISED' : 'SAFEGUARDING_RAISED',
    concern.id,
    kind === 'WHISTLEBLOWING' ? 'Whistleblowing disclosure recorded' : `Safeguarding concern raised for ${personAtRisk || 'a client'}`,
  );
  res.status(201).json(concern);
}

// PATCH /api/safeguarding/:id
export async function updateConcern(req: AuthRequest, res: Response) {
  const existing = await prisma.safeguardingConcern.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  const text = (key: string, max = 8000) => {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  };
  const when = (key: string) => {
    const d = date(b[key]);
    if (d !== undefined) data[key] = d;
  };
  const flag = (key: string) => {
    if (b[key] !== undefined) data[key] = !!b[key];
  };

  text('personAtRisk', 200);
  text('raisedByName', 200);
  text('description');
  text('immediateAction');
  text('staffInvolvedId', 40);
  text('laName', 200);
  text('laReference', 100);
  text('cqcReference', 100);
  text('policeReference', 100);
  text('outcome');
  text('lessonsLearned');
  when('occurredAt');
  when('raisedAt');
  when('laReferralDate');
  when('cqcNotifiedDate');
  flag('referredToLA');
  flag('cqcNotified');
  flag('policeInformed');
  if (b.source !== undefined) data.source = oneOf(b.source, SOURCES, existing.source);
  if (b.confidential !== undefined) data.confidential = !!b.confidential;
  if (b.harmTypes !== undefined) data.harmTypes = harmList(b.harmTypes);

  if (b.status !== undefined) {
    const status = oneOf(b.status, STATUSES, existing.status);
    // Closing without saying what happened leaves a record that proves a
    // concern was raised and nothing else — the opposite of the point.
    if (status === 'CLOSED' && existing.status !== 'CLOSED') {
      const outcome = (data.outcome as string | undefined) ?? existing.outcome;
      if (!outcome) return res.status(400).json({ error: 'Record the outcome before closing this concern.' });
      data.closedAt = new Date();
      data.closedById = req.user!.id;
    }
    if (status !== 'CLOSED' && existing.status === 'CLOSED') {
      data.closedAt = null;
      data.closedById = null;
    }
    data.status = status;
  }

  // A referral with no reference is the gap an inspector finds: the agency
  // believes it referred, and nothing proves it did.
  const referred = (data.referredToLA as boolean | undefined) ?? existing.referredToLA;
  const laRef = (data.laReference as string | undefined) ?? existing.laReference;
  if (referred && !laRef && (data.status ?? existing.status) === 'CLOSED') {
    return res.status(400).json({ error: 'Add the local authority reference before closing a referred concern.' });
  }

  const concern = await prisma.safeguardingConcern.update({
    where: { id: existing.id },
    data,
    select: listSelect,
  });

  await logAudit(
    req,
    data.status === 'CLOSED' ? 'SAFEGUARDING_CLOSED' : 'SAFEGUARDING_UPDATED',
    concern.id,
    `Safeguarding concern ${data.status === 'CLOSED' ? 'closed' : 'updated'}`,
  );
  res.json(concern);
}
