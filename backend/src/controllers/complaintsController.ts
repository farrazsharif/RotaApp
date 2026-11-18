import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isScoped, relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';

// The complaints and compliments log (Regulation 16).
//
// Reg 16 is not "have a complaints policy". It is a duty to identify, receive,
// record, handle and respond to complaints, and to be able to show CQC a
// summary of them. What an inspector asks for is the chain: when it came in,
// when it was acknowledged, what was found, what was said back, what changed
// as a result, and whether the person was told they could go to the
// Ombudsman. A note in a diary answers none of that.
//
// Compliments share the record. They are received and recorded in exactly the
// same way, and keeping them together is what makes "show me the feedback you
// had this year" one question instead of two.

// What the complaint is about. One complaint often spans several, and these
// are what make a trend report possible later.
export const CATEGORIES = [
  'CARE_QUALITY',
  'MISSED_VISIT',
  'LATE_VISIT',
  'CONTINUITY',
  'STAFF_CONDUCT',
  'COMMUNICATION',
  'MEDICATION',
  'MOVING_HANDLING',
  'PROPERTY',
  'INVOICING',
  'EQUALITY',
  'SAFEGUARDING',
  'OTHER',
];

const KINDS = ['COMPLAINT', 'COMPLIMENT'];
const RELATIONSHIPS = ['CLIENT', 'FAMILY', 'ADVOCATE', 'STAFF', 'PROFESSIONAL', 'COMMISSIONER', 'PUBLIC', 'ANONYMOUS', 'OTHER'];
const CHANNELS = ['PHONE', 'EMAIL', 'LETTER', 'IN_PERSON', 'WEBSITE', 'SURVEY', 'OTHER'];
const STATUSES = ['OPEN', 'INVESTIGATING', 'RESPONDED', 'CLOSED'];
const OUTCOMES = ['UPHELD', 'PARTLY_UPHELD', 'NOT_UPHELD', 'WITHDRAWN'];

// Where the person has a right to take it further. Signposting matters most
// here: the complaint was not upheld in full, and they may disagree.
const ESCALATABLE = ['NOT_UPHELD', 'PARTLY_UPHELD'];

const listSelect = {
  id: true,
  kind: true,
  reference: true,
  serviceUserId: true,
  complainantName: true,
  relationship: true,
  channel: true,
  receivedAt: true,
  occurredAt: true,
  categories: true,
  summary: true,
  acknowledgedAt: true,
  outcome: true,
  respondedAt: true,
  ombudsmanSignposted: true,
  escalatedToOmbudsman: true,
  status: true,
  closedAt: true,
  createdAt: true,
  receivedBy: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  staffInvolved: { select: { id: true, firstName: true, lastName: true } },
};

function clean(v: unknown, max = 8000): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, max);
}

// Distinguishes "clear this" (null) from "that is not a date" (undefined), so
// a typo is ignored rather than silently wiping a date somebody relies on.
function date(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function categoryList(v: unknown): string {
  if (!Array.isArray(v)) return '[]';
  return JSON.stringify(v.filter((c) => typeof c === 'string' && CATEGORIES.includes(c)));
}

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

// GET /api/complaints
export async function listComplaints(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};

  // A site-scoped manager sees feedback about their own clients, plus
  // anything with no client attached that they logged themselves - otherwise
  // a complaint from a neighbour would vanish the moment it was recorded.
  if (isScoped(req.user)) {
    where.OR = [relatedServiceUserScopeWhere(req.user), { serviceUserId: null, receivedById: req.user!.id }];
  }

  where.kind = typeof req.query.kind === 'string' && KINDS.includes(req.query.kind) ? req.query.kind : 'COMPLAINT';
  if (typeof req.query.status === 'string' && STATUSES.includes(req.query.status)) {
    where.status = req.query.status;
  } else if (String(req.query.open) === 'true') {
    where.status = { not: 'CLOSED' };
  }
  if (typeof req.query.serviceUserId === 'string' && req.query.serviceUserId) {
    where.serviceUserId = req.query.serviceUserId;
  }

  const rows = await prisma.complaint.findMany({
    where,
    orderBy: [{ receivedAt: 'desc' }],
    take: 500,
    select: listSelect,
  });
  res.json(rows);
}

// GET /api/complaints/:id
export async function getComplaint(req: AuthRequest, res: Response) {
  const row = await prisma.complaint.findUnique({
    where: { id: req.params.id },
    select: {
      ...listSelect,
      complainantContact: true,
      investigation: true,
      actionsTaken: true,
      lessonsLearned: true,
      ombudsmanReference: true,
      attachments: true,
      updatedAt: true,
      closedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}

// POST /api/complaints — anyone can log one. A carer told something on a
// doorstep has to be able to record it before it becomes hearsay.
export async function createComplaint(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const summary = clean(b.summary);
  if (!summary) return res.status(400).json({ error: 'Describe what was said.' });

  const kind = oneOf(b.kind, KINDS, 'COMPLAINT');
  const receivedAt = date(b.receivedAt);
  const occurredAt = date(b.occurredAt);

  const row = await prisma.complaint.create({
    data: {
      kind,
      reference: clean(b.reference, 60) || null,
      serviceUserId: clean(b.serviceUserId, 40) || null,
      staffInvolvedId: clean(b.staffInvolvedId, 40) || null,
      complainantName: clean(b.complainantName, 200) || null,
      complainantContact: clean(b.complainantContact, 200) || null,
      relationship: oneOf(b.relationship, RELATIONSHIPS, 'CLIENT'),
      channel: oneOf(b.channel, CHANNELS, 'PHONE'),
      receivedById: req.user!.id,
      receivedAt: receivedAt || new Date(),
      occurredAt: occurredAt ?? null,
      categories: categoryList(b.categories),
      summary,
      // There is nothing to investigate about a compliment, so it arrives
      // finished. Leaving it OPEN would put it on the overdue list for ever.
      status: kind === 'COMPLIMENT' ? 'CLOSED' : 'OPEN',
      closedAt: kind === 'COMPLIMENT' ? new Date() : null,
    },
    select: listSelect,
  });

  await logAudit(
    req,
    kind === 'COMPLIMENT' ? 'COMPLIMENT_RECORDED' : 'COMPLAINT_RECEIVED',
    row.id,
    kind === 'COMPLIMENT' ? 'Compliment recorded' : 'Complaint received',
  );
  res.status(201).json(row);
}

// PATCH /api/complaints/:id
export async function updateComplaint(req: AuthRequest, res: Response) {
  const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
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

  text('reference', 60);
  text('complainantName', 200);
  text('complainantContact', 200);
  text('staffInvolvedId', 40);
  text('summary');
  text('investigation');
  text('actionsTaken');
  text('lessonsLearned');
  text('ombudsmanReference', 100);
  when('receivedAt');
  when('occurredAt');
  when('acknowledgedAt');
  when('respondedAt');
  flag('ombudsmanSignposted');
  flag('escalatedToOmbudsman');
  if (b.relationship !== undefined) data.relationship = oneOf(b.relationship, RELATIONSHIPS, existing.relationship);
  if (b.channel !== undefined) data.channel = oneOf(b.channel, CHANNELS, existing.channel);
  if (b.categories !== undefined) data.categories = categoryList(b.categories);
  if (b.outcome !== undefined) {
    data.outcome = b.outcome === null || b.outcome === '' ? null : oneOf(b.outcome, OUTCOMES, existing.outcome ?? '');
    if (data.outcome === '') data.outcome = null;
  }

  if (b.status !== undefined) {
    const status = oneOf(b.status, STATUSES, existing.status);

    if (status === 'CLOSED' && existing.status !== 'CLOSED') {
      const outcome = (data.outcome as string | undefined) ?? existing.outcome;
      const respondedAt = 'respondedAt' in data ? data.respondedAt : existing.respondedAt;

      // A complaint closed with no outcome is a complaint nobody answered.
      if (!outcome) {
        return res.status(400).json({ error: 'Record the outcome before closing this complaint.' });
      }
      if (!respondedAt) {
        return res.status(400).json({ error: 'Record the date you responded before closing this complaint.' });
      }
      // Where the complaint was not upheld in full, the person has a right to
      // take it to the Local Government & Social Care Ombudsman - and no way
      // of knowing that unless somebody tells them. Signposting is part of
      // responding, so closing without it closes a complaint the person was
      // never given the chance to challenge.
      const signposted = ('ombudsmanSignposted' in data ? data.ombudsmanSignposted : existing.ombudsmanSignposted) === true;
      if (ESCALATABLE.includes(outcome) && !signposted) {
        return res.status(400).json({
          error: 'This complaint was not upheld in full. Confirm the person was told they can take it to the Ombudsman before closing it.',
        });
      }

      data.closedAt = new Date();
      data.closedById = req.user!.id;
    }
    if (status !== 'CLOSED' && existing.status === 'CLOSED') {
      data.closedAt = null;
      data.closedById = null;
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const row = await prisma.complaint.update({ where: { id: existing.id }, data, select: listSelect });

  await logAudit(
    req,
    data.status === 'CLOSED' ? 'COMPLAINT_CLOSED' : 'COMPLAINT_UPDATED',
    row.id,
    `Complaint ${data.status === 'CLOSED' ? 'closed' : 'updated'}`,
  );
  res.json(row);
}

// Deliberately no DELETE. A complaint record is evidence, and CQC can ask for
// a summary of every complaint received. One logged in error is closed with an
// outcome saying so, not removed.
