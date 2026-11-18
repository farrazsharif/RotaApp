import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToCompany } from '../lib/socket';
import { isScoped, serviceUserInScope, relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';

// Accidents, incidents and near misses.
//
// A record is made in two passes. The carer reports what happened, from their
// phone, at the time — that is all someone standing in a hallway can be asked
// for. The office then investigates and completes the checklist, which is
// Care 24's Accident & Incident Form (the HSE investigation checklist).
//
// A carer can create a report and read back their own; everything else is the
// office's, behind manage_service_users.

const KINDS = ['ACCIDENT', 'INCIDENT', 'NEAR_MISS'];
const STATUSES = ['REPORTED', 'INVESTIGATING', 'CLOSED'];
// Harm levels, in the language Reg 20 uses. Candour is engaged from MODERATE
// upwards; the office still records the level for the lower ones, because the
// decision not to apply candour is itself a thing an inspector asks to see.
const HARM_LEVELS = ['NONE', 'LOW', 'MODERATE', 'SEVERE', 'DEATH', 'PSYCHOLOGICAL'];

const listSelect = {
  id: true,
  serviceUserId: true,
  shiftId: true,
  occurredAt: true,
  kind: true,
  category: true,
  whatHappened: true,
  injuries: true,
  emergencyServices: true,
  candourRequired: true,
  candourToldAt: true,
  candourWrittenAt: true,
  status: true,
  closedAt: true,
  createdAt: true,
  reportedBy: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

function clean(v: unknown, max = 4000): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, max);
}

// A date the office can set or clear. Distinguishes "clear this" (null) from
// "that is not a date" (not ok), so a typo is refused rather than silently
// wiping a date somebody relies on.
function dateField(v: unknown): { ok: true; value: Date | null } | { ok: false } {
  if (v === null || v === '') return { ok: true, value: null };
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? { ok: false } : { ok: true, value: d };
}

// GET /api/incidents — the office list. Carers get only their own reports,
// which is how they check what they sent rather than a window onto everyone's.
export async function listIncidents(req: AuthRequest, res: Response) {
  const mine = req.user!.role === Role.EMPLOYEE || String(req.query.mine) === 'true';
  const where: Record<string, unknown> = {};

  if (mine) {
    where.reportedById = req.user!.id;
  } else if (isScoped(req.user)) {
    // A scoped manager sees incidents for their own clients, plus any with no
    // client attached that they reported themselves — otherwise a staff-only
    // incident would vanish the moment it was filed.
    where.OR = [
      relatedServiceUserScopeWhere(req.user),
      { serviceUserId: null, reportedById: req.user!.id },
    ];
  }

  const status = String(req.query.status || '');
  if (STATUSES.includes(status)) where.status = status;
  if (req.query.serviceUserId) where.serviceUserId = String(req.query.serviceUserId);

  const rows = await prisma.incident.findMany({
    where,
    select: listSelect,
    orderBy: { occurredAt: 'desc' },
    take: 500,
  });
  res.json(rows);
}

// GET /api/incidents/:id — the whole record, investigation included.
export async function getIncident(req: AuthRequest, res: Response) {
  const row = await prisma.incident.findUnique({
    where: { id: req.params.id },
    include: {
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
      closedBy: { select: { id: true, firstName: true, lastName: true } },
      serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true } },
    },
  });
  if (!row) return res.status(404).json({ error: 'Incident not found' });

  // A carer may read back their own report and nothing else.
  if (req.user!.role === Role.EMPLOYEE && row.reportedById !== req.user!.id) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  if (row.serviceUserId && !(await serviceUserInScope(req.user, row.serviceUserId))) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.json(row);
}

// POST /api/incidents — the carer's report. Deliberately short: what happened,
// who was hurt, what was done, who was told.
export async function createIncident(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;

  const whatHappened = clean(b.whatHappened);
  if (!whatHappened) return res.status(400).json({ error: 'Please describe what happened.' });

  const occurredRaw = clean(b.occurredAt);
  const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();
  if (isNaN(occurredAt.getTime())) return res.status(400).json({ error: 'That date and time is not valid.' });
  // A report of something that has not happened yet is a mistake, not a record.
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ error: 'The date and time cannot be in the future.' });
  }

  const serviceUserId = clean(b.serviceUserId, 60) ?? null;
  if (serviceUserId && !(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const kindRaw = String(b.kind || 'ACCIDENT');
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'ACCIDENT';

  const row = await prisma.incident.create({
    data: {
      companyId: req.user!.companyId,
      serviceUserId,
      shiftId: clean(b.shiftId, 60) ?? null,
      reportedById: req.user!.id,
      occurredAt,
      kind,
      category: clean(b.category, 80) ?? null,
      whatHappened,
      injuries: clean(b.injuries) ?? null,
      immediateAction: clean(b.immediateAction) ?? null,
      whoInformed: clean(b.whoInformed) ?? null,
      witnesses: clean(b.witnesses) ?? null,
      emergencyServices: b.emergencyServices === true,
    },
    select: listSelect,
  });

  await logAudit(
    req,
    'INCIDENT_REPORTED',
    row.serviceUser ? `${row.serviceUser.firstName} ${row.serviceUser.lastName}` : 'No client',
    `${kind.replace('_', ' ').toLowerCase()} reported`,
  );

  // The office needs to know now, not at the next refresh.
  if (req.user!.companyId) {
    emitToCompany(req.user!.companyId, 'data:changed', { resource: '/api/incidents' });
  }
  res.status(201).json(row);
}

// PATCH /api/incidents/:id — the office half: the investigation checklist, the
// status, and the detail of the report where the office has to correct it.
export async function updateIncident(req: AuthRequest, res: Response) {
  const existing = await prisma.incident.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      serviceUserId: true,
      status: true,
      candourRequired: true,
      candourToldAt: true,
    },
  });
  if (!existing) return res.status(404).json({ error: 'Incident not found' });
  if (existing.serviceUserId && !(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (b.investigation !== undefined) {
    const raw = typeof b.investigation === 'string' ? b.investigation : JSON.stringify(b.investigation);
    try {
      JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'investigation must be valid JSON' });
    }
    data.investigation = raw;
  }

  for (const f of ['category', 'whatHappened', 'injuries', 'immediateAction', 'whoInformed', 'witnesses'] as const) {
    if (f in b) data[f] = clean(b[f]) ?? null;
  }
  if (b.emergencyServices !== undefined) data.emergencyServices = b.emergencyServices === true;
  if (b.kind !== undefined && KINDS.includes(String(b.kind))) data.kind = String(b.kind);

  // Duty of candour and RIDDOR. Both "required" flags are tri-state: null is
  // an open question, and the dashboard chases those rather than treating an
  // unanswered incident as cleared.
  for (const f of ['candourRequired', 'riddorRequired'] as const) {
    if (f in b) data[f] = b[f] === null || b[f] === '' ? null : b[f] === true;
  }
  if (b.candourApology !== undefined) data.candourApology = b.candourApology === true;
  for (const f of ['candourToldWho', 'candourNotes', 'riddorRef'] as const) {
    if (f in b) data[f] = clean(b[f]) ?? null;
  }
  if ('candourHarm' in b) {
    const harm = clean(b.candourHarm, 20);
    if (harm && !HARM_LEVELS.includes(harm)) return res.status(400).json({ error: 'Unknown harm level' });
    data.candourHarm = harm ?? null;
  }
  for (const f of ['candourToldAt', 'candourWrittenAt', 'candourOutcomeAt', 'riddorReportedAt'] as const) {
    if (!(f in b)) continue;
    const parsed = dateField(b[f]);
    if (!parsed.ok) return res.status(400).json({ error: 'That date is not valid.' });
    if (parsed.value && parsed.value.getTime() > Date.now() + 5 * 60 * 1000) {
      return res.status(400).json({ error: 'That date cannot be in the future.' });
    }
    data[f] = parsed.value;
  }

  if (b.status !== undefined) {
    const status = String(b.status);
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    data.status = status;
    if (status === 'CLOSED') {
      // Reg 20 is a duty to tell the person, not a box on a form. If the office
      // has said candour applies, closing without a notification date would
      // leave a record that says the duty was owed and never discharged.
      const required = ('candourRequired' in data ? data.candourRequired : existing.candourRequired) === true;
      const toldAt = 'candourToldAt' in data ? data.candourToldAt : existing.candourToldAt;
      if (required && !toldAt) {
        return res.status(400).json({
          error: 'Duty of candour applies to this incident. Record the date the person was told before closing it.',
        });
      }
      // Closing is the thing an inspector asks about, so it is stamped with who
      // and when rather than inferred from the row's last edit.
      data.closedAt = new Date();
      data.closedById = req.user!.id;
      if (b.closedSignature !== undefined) data.closedSignature = clean(b.closedSignature, 200000) ?? null;
    } else {
      data.closedAt = null;
      data.closedById = null;
      data.closedSignature = null;
    }
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const row = await prisma.incident.update({ where: { id: existing.id }, data, select: listSelect });

  if (data.status) {
    await logAudit(
      req,
      'INCIDENT_STATUS_CHANGED',
      row.serviceUser ? `${row.serviceUser.firstName} ${row.serviceUser.lastName}` : 'No client',
      `Incident marked ${String(data.status).toLowerCase()}`,
    );
  }
  if (req.user!.companyId) {
    emitToCompany(req.user!.companyId, 'data:changed', { resource: '/api/incidents' });
  }
  res.json(row);
}

// DELETE /api/incidents/:id — only for one filed in error. An incident record
// is evidence, so this is admin-only and audited rather than offered to the
// office alongside "close".
export async function deleteIncident(req: AuthRequest, res: Response) {
  const row = await prisma.incident.findUnique({
    where: { id: req.params.id },
    select: { id: true, serviceUserId: true, kind: true, occurredAt: true },
  });
  if (!row) return res.status(404).json({ error: 'Incident not found' });

  await prisma.incident.delete({ where: { id: row.id } });
  await logAudit(req, 'INCIDENT_DELETED', row.id, `Incident of ${row.occurredAt.toISOString()} deleted`);
  if (req.user!.companyId) {
    emitToCompany(req.user!.companyId, 'data:changed', { resource: '/api/incidents' });
  }
  res.json({ ok: true });
}
