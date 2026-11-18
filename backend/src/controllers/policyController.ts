import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { logAudit } from '../lib/audit';

// The policy library (Reg 17).
//
// A folder of documents is not a governance record. Three things make it one:
// a version, a review date, and who has read it. The last is what an
// inspector actually asks for - not "do you have a medication policy" but
// "show me who has read it".
//
// Signatures are recorded against the VERSION signed. Bumping a version is
// therefore the act of re-asking everybody, and the old signatures stand as
// the record of what people agreed to at the time rather than being
// overwritten or quietly counted as current.

export const POLICY_CATEGORIES = [
  'SAFEGUARDING',
  'MEDICATION',
  'HEALTH_SAFETY',
  'IPC',
  'HR',
  'DATA',
  'CARE',
  'COMPLAINTS',
  'BUSINESS_CONTINUITY',
  'OTHER',
];

const AUDIENCES = ['ALL', 'CARERS', 'OFFICE', 'MANAGERS'];
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

// The cap is per field, and the policy body is the one that needs room: a
// full medication policy in a professional library runs past 130,000
// characters, and truncating a policy is not an option.
function clean(v: unknown, max = 300000): string | undefined {
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

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

// Does this policy apply to this person? An office manager does not need to
// sign the lone-working policy, and asking them to is how a read-and-sign
// list stops being believed.
function appliesTo(audience: string, role: string): boolean {
  if (audience === 'ALL') return true;
  if (audience === 'CARERS') return role === Role.EMPLOYEE;
  if (audience === 'OFFICE') return role === Role.ADMIN || role === Role.MANAGER;
  if (audience === 'MANAGERS') return role === Role.ADMIN || role === Role.MANAGER;
  return true;
}

const listSelect = {
  id: true,
  title: true,
  reference: true,
  category: true,
  version: true,
  issuedAt: true,
  reviewDate: true,
  audience: true,
  requiresAck: true,
  status: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
};

// GET /api/policies — the office library, with signature counts.
export async function listPolicies(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  const status = String(req.query.status || '');
  if (STATUSES.includes(status)) where.status = status;
  const category = String(req.query.category || '');
  if (POLICY_CATEGORIES.includes(category)) where.category = category;

  const policies = await prisma.policy.findMany({
    where,
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
    select: listSelect,
  });

  // How many of the people it applies to have signed THIS version. Counting
  // signatures of any version would report a policy as read when the version
  // people read has since been replaced.
  const [staff, acks] = await Promise.all([
    prisma.user.findMany({ where: { active: true, serviceAccount: false }, select: { id: true, role: true } }),
    prisma.policyAcknowledgement.findMany({ select: { policyId: true, userId: true, version: true } }),
  ]);

  const rows = policies.map((p) => {
    const due = staff.filter((u) => appliesTo(p.audience, u.role));
    const dueIds = new Set(due.map((u) => u.id));
    const signed = acks.filter((a) => a.policyId === p.id && a.version === p.version && dueIds.has(a.userId)).length;
    return { ...p, dueCount: p.requiresAck ? due.length : 0, signedCount: p.requiresAck ? signed : 0 };
  });

  res.json(rows);
}

// GET /api/policies/mine — what the signed-in person still has to read.
//
// Deliberately WITHOUT the policy text. A real library is a couple of
// megabytes of it, and sending all of that so somebody can see a list of
// titles is how a phone on mobile data stops being able to open the screen
// at all. The text comes from /mine/:id when a policy is actually opened.
export async function myPolicies(req: AuthRequest, res: Response) {
  const [policies, mine] = await Promise.all([
    prisma.policy.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ issuedAt: 'desc' }],
      select: listSelect,
    }),
    prisma.policyAcknowledgement.findMany({
      where: { userId: req.user!.id },
      select: { policyId: true, version: true, signedAt: true },
    }),
  ]);

  const rows = policies
    .filter((p) => appliesTo(p.audience, req.user!.role))
    .map((p) => {
      const sig = mine.find((a) => a.policyId === p.id && a.version === p.version);
      return { ...p, signedAt: sig?.signedAt ?? null, needsSignature: p.requiresAck && !sig };
    });

  res.json(rows);
}

// GET /api/policies/mine/:id — one policy's text, for the person reading it.
// Scoped to what applies to them: this is the staff-facing read, so it must
// not become a way to pull any policy by id.
export async function myPolicy(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({
    where: { id: req.params.id },
    select: { ...listSelect, bodyText: true, attachments: true },
  });
  if (!policy || policy.status !== 'ACTIVE') return res.status(404).json({ error: 'Not found' });
  if (!appliesTo(policy.audience, req.user!.role)) return res.status(404).json({ error: 'Not found' });

  const sig = await prisma.policyAcknowledgement.findFirst({
    where: { policyId: policy.id, userId: req.user!.id, version: policy.version },
    select: { signedAt: true },
  });
  res.json({
    ...policy,
    signedAt: sig?.signedAt ?? null,
    needsSignature: policy.requiresAck && !sig,
  });
}

// GET /api/policies/:id — the document, plus who has signed it.
export async function getPolicy(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({
    where: { id: req.params.id },
    select: {
      ...listSelect,
      bodyText: true,
      attachments: true,
      createdAt: true,
      acknowledgements: {
        orderBy: { signedAt: 'desc' },
        select: {
          id: true,
          version: true,
          signedAt: true,
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });
  if (!policy) return res.status(404).json({ error: 'Not found' });

  // Everyone it applies to, so the screen can show who has NOT signed - which
  // is the half of the list that leads to an action.
  const staff = await prisma.user.findMany({
    where: { active: true, serviceAccount: false },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  const due = staff.filter((u) => appliesTo(policy.audience, u.role));
  const signedIds = new Set(
    policy.acknowledgements.filter((a) => a.version === policy.version).map((a) => a.user.id),
  );

  res.json({
    ...policy,
    due,
    outstanding: policy.requiresAck ? due.filter((u) => !signedIds.has(u.id)) : [],
  });
}

// POST /api/policies
export async function createPolicy(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const title = clean(b.title, 300);
  if (!title) return res.status(400).json({ error: 'Give the policy a title.' });

  const policy = await prisma.policy.create({
    data: {
      title,
      reference: clean(b.reference, 60) || null,
      category: oneOf(b.category, POLICY_CATEGORIES, 'OTHER'),
      bodyText: clean(b.bodyText) || null,
      version: clean(b.version, 20) || '1.0',
      issuedAt: date(b.issuedAt) || new Date(),
      reviewDate: date(b.reviewDate) ?? null,
      audience: oneOf(b.audience, AUDIENCES, 'ALL'),
      requiresAck: b.requiresAck !== false,
      status: oneOf(b.status, STATUSES, 'DRAFT'),
      ownerId: clean(b.ownerId, 40) || null,
    },
    select: listSelect,
  });

  await logAudit(req, 'POLICY_CREATED', policy.id, `Policy created: ${title}`);
  res.status(201).json(policy);
}

// PATCH /api/policies/:id
export async function updatePolicy(req: AuthRequest, res: Response) {
  const existing = await prisma.policy.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, max] of [['title', 300], ['reference', 60], ['bodyText', 100000], ['ownerId', 40]] as const) {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  }
  for (const key of ['issuedAt', 'reviewDate'] as const) {
    const d = date(b[key]);
    if (d !== undefined) data[key] = d;
  }
  if (b.category !== undefined) data.category = oneOf(b.category, POLICY_CATEGORIES, existing.category);
  if (b.audience !== undefined) data.audience = oneOf(b.audience, AUDIENCES, existing.audience);
  if (b.requiresAck !== undefined) data.requiresAck = b.requiresAck !== false;

  if (b.version !== undefined) {
    const version = clean(b.version, 20);
    if (!version) return res.status(400).json({ error: 'A policy needs a version.' });
    data.version = version;
  }

  if (b.status !== undefined) {
    const status = oneOf(b.status, STATUSES, existing.status);
    // Publishing is what puts it in front of staff, so it has to be a
    // document rather than an empty shell.
    if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const body = ('bodyText' in data ? data.bodyText : existing.bodyText) as string | null;
      const hasFile = existing.attachments && existing.attachments !== '[]';
      if (!body && !hasFile) {
        return res.status(400).json({ error: 'Add the policy text or attach the document before publishing it.' });
      }
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const policy = await prisma.policy.update({ where: { id: existing.id }, data, select: listSelect });

  if (data.version && data.version !== existing.version) {
    await logAudit(
      req,
      'POLICY_VERSION_BUMPED',
      policy.id,
      `${policy.title} moved from v${existing.version} to v${data.version} — everyone it applies to must sign again`,
    );
  } else if (data.status) {
    await logAudit(req, 'POLICY_STATUS_CHANGED', policy.id, `${policy.title} marked ${String(data.status).toLowerCase()}`);
  }
  res.json(policy);
}

// POST /api/policies/:id/sign — the signature. Anyone can sign one that
// applies to them; nobody can sign on anyone else's behalf.
export async function signPolicy(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({ where: { id: req.params.id } });
  if (!policy) return res.status(404).json({ error: 'Not found' });
  if (policy.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'This policy is not published.' });
  }
  if (!appliesTo(policy.audience, req.user!.role)) {
    return res.status(400).json({ error: 'This policy does not apply to you.' });
  }

  // Signing twice is not an error - a carer tapping again on a bad signal
  // means the same thing they meant the first time.
  const existing = await prisma.policyAcknowledgement.findFirst({
    where: { policyId: policy.id, userId: req.user!.id, version: policy.version },
  });
  if (existing) return res.json(existing);

  const ack = await prisma.policyAcknowledgement.create({
    data: { policyId: policy.id, userId: req.user!.id, version: policy.version },
  });
  await logAudit(req, 'POLICY_SIGNED', policy.id, `${policy.title} v${policy.version} read and signed`);
  res.status(201).json(ack);
}

// DELETE /api/policies/:id — for one created in error. A policy that is no
// longer in force is archived instead, so its signatures stay readable.
export async function deletePolicy(req: AuthRequest, res: Response) {
  const existing = await prisma.policy.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, status: true, _count: { select: { acknowledgements: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing._count.acknowledgements > 0) {
    return res.status(400).json({
      error: 'People have signed this policy. Archive it instead — deleting it would delete their signatures.',
    });
  }
  await prisma.policy.delete({ where: { id: existing.id } });
  await logAudit(req, 'POLICY_DELETED', existing.id, `Policy deleted: ${existing.title}`);
  res.json({ ok: true });
}
