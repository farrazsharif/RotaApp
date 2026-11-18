import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Care audits and the service improvement plan (Reg 17).
//
// These are one module because they are one loop: an audit finds something,
// the finding becomes an action, the action gets evidence, and the next audit
// checks it stuck. Split across two screens that loop stops being visible,
// and an improvement plan you cannot trace back to a finding is a list of
// good intentions.

export const AUDIT_TYPES = [
  'CARE_PLAN',
  'MAR',
  'DAILY_NOTES',
  'RECRUITMENT_FILE',
  'CALL_MONITORING',
  'MEDICATION',
  'SAFEGUARDING',
  'IPC',
  'HEALTH_SAFETY',
  'COMPLAINTS',
  'OTHER',
];

export const ACTION_SOURCES = [
  'AUDIT',
  'COMPLAINT',
  'SAFEGUARDING',
  'INCIDENT',
  'FEEDBACK',
  'INSPECTION',
  'OTHER',
];

const AUDIT_STATUSES = ['OPEN', 'COMPLETE'];
const ACTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

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

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min || i > max ? null : i;
}

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

const auditSelect = {
  id: true,
  type: true,
  title: true,
  scope: true,
  periodStart: true,
  periodEnd: true,
  auditedAt: true,
  score: true,
  maxScore: true,
  findings: true,
  nextDueDate: true,
  status: true,
  createdAt: true,
  auditedBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { actions: true } },
};

const actionSelect = {
  id: true,
  title: true,
  detail: true,
  source: true,
  auditId: true,
  dueDate: true,
  priority: true,
  status: true,
  evidence: true,
  completedAt: true,
  createdAt: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  completedBy: { select: { id: true, firstName: true, lastName: true } },
  audit: { select: { id: true, type: true, title: true } },
};

// --- Audits ----------------------------------------------------------------

// GET /api/governance/audits
export async function listAudits(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  const type = String(req.query.type || '');
  if (AUDIT_TYPES.includes(type)) where.type = type;
  const status = String(req.query.status || '');
  if (AUDIT_STATUSES.includes(status)) where.status = status;

  const audits = await prisma.audit.findMany({
    where,
    orderBy: [{ auditedAt: 'desc' }],
    take: 500,
    select: auditSelect,
  });
  res.json(audits);
}

// GET /api/governance/audits/:id
export async function getAudit(req: AuthRequest, res: Response) {
  const audit = await prisma.audit.findUnique({
    where: { id: req.params.id },
    select: {
      ...auditSelect,
      attachments: true,
      updatedAt: true,
      actions: { orderBy: [{ createdAt: 'desc' }], select: actionSelect },
    },
  });
  if (!audit) return res.status(404).json({ error: 'Not found' });
  res.json(audit);
}

// POST /api/governance/audits
export async function createAudit(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const type = oneOf(b.type, AUDIT_TYPES, '');
  if (!type) return res.status(400).json({ error: 'Choose what kind of audit this is.' });

  const max = intOrNull(b.maxScore, 1, 10000);
  const score = intOrNull(b.score, 0, 10000);
  if (score !== null && max !== null && score > max) {
    return res.status(400).json({ error: 'The score cannot be higher than the total.' });
  }

  const audit = await prisma.audit.create({
    data: {
      type,
      title: clean(b.title, 300) || null,
      scope: clean(b.scope, 2000) || null,
      periodStart: date(b.periodStart) ?? null,
      periodEnd: date(b.periodEnd) ?? null,
      auditedById: req.user!.id,
      auditedAt: date(b.auditedAt) || new Date(),
      score,
      maxScore: max,
      findings: clean(b.findings) || null,
      nextDueDate: date(b.nextDueDate) ?? null,
      status: oneOf(b.status, AUDIT_STATUSES, 'OPEN'),
    },
    select: auditSelect,
  });

  await logAudit(req, 'AUDIT_RECORDED', audit.id, `${type.replace(/_/g, ' ').toLowerCase()} audit recorded`);
  res.status(201).json(audit);
}

// PATCH /api/governance/audits/:id
export async function updateAudit(req: AuthRequest, res: Response) {
  const existing = await prisma.audit.findUnique({
    where: { id: req.params.id },
    select: { id: true, type: true, status: true, findings: true, score: true, maxScore: true, _count: { select: { actions: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, max] of [['title', 300], ['scope', 2000], ['findings', 8000]] as const) {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  }
  for (const key of ['periodStart', 'periodEnd', 'auditedAt', 'nextDueDate'] as const) {
    const d = date(b[key]);
    if (d !== undefined) data[key] = d;
  }
  if (b.type !== undefined) data.type = oneOf(b.type, AUDIT_TYPES, existing.type);
  if (b.score !== undefined) data.score = intOrNull(b.score, 0, 10000);
  if (b.maxScore !== undefined) data.maxScore = intOrNull(b.maxScore, 1, 10000);

  const score = ('score' in data ? data.score : existing.score) as number | null;
  const maxScore = ('maxScore' in data ? data.maxScore : existing.maxScore) as number | null;
  if (score !== null && maxScore !== null && score > maxScore) {
    return res.status(400).json({ error: 'The score cannot be higher than the total.' });
  }

  if (b.status !== undefined) {
    const status = oneOf(b.status, AUDIT_STATUSES, existing.status);
    // An audit with no findings written down is an audit nobody can check,
    // and one that found nothing is worth saying so explicitly.
    if (status === 'COMPLETE' && existing.status !== 'COMPLETE') {
      const findings = ('findings' in data ? data.findings : existing.findings) as string | null;
      if (!findings) {
        return res.status(400).json({ error: 'Write up what the audit found before marking it complete.' });
      }
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const audit = await prisma.audit.update({ where: { id: existing.id }, data, select: auditSelect });
  res.json(audit);
}

// DELETE /api/governance/audits/:id — only one with no actions hanging off it.
export async function deleteAudit(req: AuthRequest, res: Response) {
  const existing = await prisma.audit.findUnique({
    where: { id: req.params.id },
    select: { id: true, type: true, _count: { select: { actions: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing._count.actions > 0) {
    return res.status(400).json({
      error: 'This audit has actions raised from it. Deleting it would orphan them — leave it as the record of where they came from.',
    });
  }
  await prisma.audit.delete({ where: { id: existing.id } });
  await logAudit(req, 'AUDIT_DELETED', existing.id, `${existing.type} audit deleted`);
  res.json({ ok: true });
}

// --- Improvement actions ---------------------------------------------------

// GET /api/governance/actions
export async function listActions(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  const status = String(req.query.status || '');
  if (ACTION_STATUSES.includes(status)) where.status = status;
  else if (String(req.query.open) === 'true') where.status = { in: ['OPEN', 'IN_PROGRESS'] };
  const source = String(req.query.source || '');
  if (ACTION_SOURCES.includes(source)) where.source = source;
  if (typeof req.query.auditId === 'string' && req.query.auditId) where.auditId = req.query.auditId;

  const actions = await prisma.improvementAction.findMany({
    where,
    // Overdue first, then by due date; undated last. An improvement plan
    // sorted by creation is a plan nobody works through.
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 500,
    select: actionSelect,
  });
  res.json(actions);
}

// POST /api/governance/actions
export async function createAction(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const title = clean(b.title, 300);
  if (!title) return res.status(400).json({ error: 'Say what needs doing.' });

  // A stated origin that points at nothing is worse than OTHER: it implies a
  // trail that is not there.
  const auditId = clean(b.auditId, 40) || null;
  if (auditId) {
    const audit = await prisma.audit.findUnique({ where: { id: auditId }, select: { id: true } });
    if (!audit) return res.status(404).json({ error: 'That audit no longer exists.' });
  }

  const action = await prisma.improvementAction.create({
    data: {
      title,
      detail: clean(b.detail) || null,
      source: oneOf(b.source, ACTION_SOURCES, auditId ? 'AUDIT' : 'OTHER'),
      auditId,
      ownerId: clean(b.ownerId, 40) || null,
      dueDate: date(b.dueDate) ?? null,
      priority: oneOf(b.priority, PRIORITIES, 'MEDIUM'),
      createdById: req.user!.id,
    },
    select: actionSelect,
  });

  await logAudit(req, 'IMPROVEMENT_ACTION_RAISED', action.id, `Action raised: ${title}`);
  res.status(201).json(action);
}

// PATCH /api/governance/actions/:id
export async function updateAction(req: AuthRequest, res: Response) {
  const existing = await prisma.improvementAction.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, max] of [['title', 300], ['detail', 8000], ['evidence', 8000], ['ownerId', 40]] as const) {
    if (b[key] !== undefined) data[key] = clean(b[key], max) || null;
  }
  const due = date(b.dueDate);
  if (due !== undefined) data.dueDate = due;
  if (b.priority !== undefined) data.priority = oneOf(b.priority, PRIORITIES, existing.priority);
  if (b.source !== undefined) data.source = oneOf(b.source, ACTION_SOURCES, existing.source);

  if (b.status !== undefined) {
    const status = oneOf(b.status, ACTION_STATUSES, existing.status);

    if (status === 'DONE' && existing.status !== 'DONE') {
      // The whole reason this field exists. An action marked done with
      // nothing behind it turns the improvement plan into a list of good
      // intentions, which is exactly what an inspector is testing for.
      const evidence = ('evidence' in data ? data.evidence : existing.evidence) as string | null;
      if (!evidence) {
        return res.status(400).json({ error: 'Record what shows this was actually done before closing it.' });
      }
      data.completedAt = new Date();
      data.completedById = req.user!.id;
    }
    if (status !== 'DONE' && existing.status === 'DONE') {
      data.completedAt = null;
      data.completedById = null;
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const action = await prisma.improvementAction.update({
    where: { id: existing.id },
    data,
    select: actionSelect,
  });

  if (data.status === 'DONE') {
    await logAudit(req, 'IMPROVEMENT_ACTION_COMPLETED', action.id, `Action completed: ${action.title}`);
  }
  res.json(action);
}

// DELETE /api/governance/actions/:id — for one raised in error. An action
// that turned out not to be needed is cancelled, which keeps the reasoning.
export async function deleteAction(req: AuthRequest, res: Response) {
  const existing = await prisma.improvementAction.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, status: true },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.status === 'DONE') {
    return res.status(400).json({
      error: 'This action is closed with evidence. It is part of the record of what the service put right.',
    });
  }
  await prisma.improvementAction.delete({ where: { id: existing.id } });
  await logAudit(req, 'IMPROVEMENT_ACTION_DELETED', existing.id, `Action deleted: ${existing.title}`);
  res.json({ ok: true });
}
