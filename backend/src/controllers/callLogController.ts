import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';

// How long after a visit a carer may still amend its log from the carer app
// (e.g. to add a task they forgot). Older records are amended by a manager via
// the portal, keeping late changes to care records controlled and traceable.
const CALL_LOG_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const include = {
  user: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  shift: {
    select: {
      id: true, date: true, startTime: true, endTime: true, visitName: true,
      // Needed so the UI can show the carer's actual clock in/out times
      // for the visit rather than the scheduled visit window.
      clockRecords: { select: { userId: true, clockIn: true, clockOut: true } },
    },
  },
};

type Signature = { userId: string; firstName: string; lastName: string; signedAt: string };

// Normalise the ticked-tasks payload into a stored JSON string. Returns
// undefined when the caller didn't send `tasks` at all (so we don't overwrite
// an existing value), or a clean JSON array string otherwise.
function normalizeTasks(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return '[]';
  const clean = raw
    .filter((t) => t && typeof t === 'object' && typeof (t as any).id === 'string')
    .slice(0, 50)
    .map((t: any) => ({
      id: String(t.id),
      label: String(t.label || ''),
      ...(t.phrase ? { phrase: String(t.phrase) } : {}),
      ...(t.detail ? { detail: String(t.detail).slice(0, 500) } : {}),
      ...(t.refused ? { refused: true } : {}),
    }));
  return JSON.stringify(clean);
}

// Normalise the supported-living session-log domains: a JSON array of string
// keys. Returns undefined when the caller didn't send it (don't overwrite).
function normalizeDomains(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return '[]';
  const clean = [...new Set(raw.filter((k) => typeof k === 'string').map((k) => String(k).slice(0, 40)))].slice(0, 30);
  return JSON.stringify(clean);
}

function parseSigs(raw: string | null): Signature[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function selfSignature(req: AuthRequest): Promise<Signature> {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  return {
    userId: req.user!.id,
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    signedAt: new Date().toISOString(),
  };
}

export async function createCallLog(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, note, tasks, supportDomains } = req.body;
  if (!serviceUserId || !note || !String(note).trim()) {
    return res.status(400).json({ error: 'serviceUserId and note are required' });
  }
  const tasksJson = normalizeTasks(tasks);
  const domainsJson = normalizeDomains(supportDomains);

  // One shared log per visit: if a log already exists for this shift, funnel
  // the write into it (update note + re-sign) instead of creating a duplicate.
  // This is also the path a carer takes to amend a saved log later.
  if (shiftId) {
    const existing = await prisma.callLog.findFirst({ where: { shiftId } });
    if (existing) {
      // Amending an existing visit log: only a carer on the call (or the author)
      // may change it, and only within the edit window.
      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        select: { userId: true, date: true, coverCarers: { select: { id: true } } },
      });
      const onCall = !!shift && (shift.userId === req.user!.id || shift.coverCarers.some((c) => c.id === req.user!.id));
      if (!onCall && existing.userId !== req.user!.id) {
        return res.status(403).json({ error: 'You are not assigned to this call' });
      }
      if (shift && Date.now() - new Date(shift.date).getTime() > CALL_LOG_EDIT_WINDOW_MS) {
        return res.status(403).json({ error: 'This visit is too old to edit here — ask your manager to amend it.' });
      }

      const noteChanged = String(note).trim() !== existing.note;
      const log = await prisma.callLog.update({
        where: { id: existing.id },
        data: {
          note: String(note).trim(),
          ...(tasksJson !== undefined ? { tasks: tasksJson } : {}),
          ...(domainsJson !== undefined ? { supportDomains: domainsJson } : {}),
          signedBy: JSON.stringify([await selfSignature(req)]),
        },
        include,
      });
      // Record post-save amendments to a care record so managers can see them.
      if (noteChanged) {
        const who = log.serviceUser ? `${log.serviceUser.firstName} ${log.serviceUser.lastName}` : 'a service user';
        await logAudit(req, 'CALL_LOG_AMENDED', who, 'Call log note edited');
      }
      return res.json(log);
    }
  }

  const log = await prisma.callLog.create({
    data: {
      serviceUserId,
      shiftId: shiftId || null,
      userId: req.user!.id,
      note: String(note).trim(),
      ...(tasksJson !== undefined ? { tasks: tasksJson } : {}),
      ...(domainsJson !== undefined ? { supportDomains: domainsJson } : {}),
      // Author signs on create.
      signedBy: JSON.stringify([await selfSignature(req)]),
    },
    include,
  });
  res.status(201).json(log);
}

// Office backfill: a manager records a visit's call log after the fact (carer
// had no signal). The note is attributed to the carer who did the visit
// (asUserId) and the change is audited. Creates the log, or updates the visit's
// existing one.
export async function createCallLogAsManager(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, note, asUserId, tasks } = req.body as { serviceUserId?: string; shiftId?: string; note?: string; asUserId?: string; tasks?: unknown };
  if (!serviceUserId || !note || !String(note).trim()) {
    return res.status(400).json({ error: 'serviceUserId and note are required' });
  }
  const tasksJson = normalizeTasks(tasks);
  const authorId = asUserId || req.user!.id;
  const author = await prisma.user.findUnique({ where: { id: authorId }, select: { firstName: true, lastName: true } });
  const sig: Signature = { userId: authorId, firstName: author?.firstName || '', lastName: author?.lastName || '', signedAt: new Date().toISOString() };

  const existing = shiftId ? await prisma.callLog.findFirst({ where: { shiftId } }) : null;
  const taskData = tasksJson !== undefined ? { tasks: tasksJson } : {};
  const log = existing
    ? await prisma.callLog.update({ where: { id: existing.id }, data: { note: String(note).trim(), ...taskData, userId: authorId, signedBy: JSON.stringify([sig]) }, include })
    : await prisma.callLog.create({ data: { serviceUserId, shiftId: shiftId || null, userId: authorId, note: String(note).trim(), ...taskData, signedBy: JSON.stringify([sig]) }, include });

  const who = log.serviceUser ? `${log.serviceUser.firstName} ${log.serviceUser.lastName}` : 'a service user';
  await logAudit(req, existing ? 'CALL_LOG_AMENDED' : 'CALL_LOG_ADDED', who, 'Office-entered call log');
  res.status(existing ? 200 : 201).json(log);
}

// A co-carer confirms & signs the existing shared log (no retyping).
export async function signCallLog(req: AuthRequest, res: Response) {
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  // Only a carer actually assigned to the visit may sign its log.
  if (existing.shiftId) {
    const shift = await prisma.shift.findUnique({
      where: { id: existing.shiftId },
      select: { userId: true, coverCarers: { select: { id: true } } },
    });
    const onShift = !!shift && (shift.userId === req.user!.id || shift.coverCarers.some((c) => c.id === req.user!.id));
    if (!onShift) return res.status(403).json({ error: 'You are not assigned to this call' });
  }

  const sigs = parseSigs(existing.signedBy);
  // Legacy logs may have no signedBy yet — seed with the original author.
  if (sigs.length === 0 && existing.userId) {
    sigs.push({ userId: existing.userId, firstName: '', lastName: '', signedAt: existing.createdAt.toISOString() });
  }
  if (!sigs.some((s) => s.userId === req.user!.id)) {
    sigs.push(await selfSignature(req));
  }
  const log = await prisma.callLog.update({
    where: { id: existing.id },
    data: { signedBy: JSON.stringify(sigs) },
    include,
  });
  res.json(log);
}

export async function listCallLogs(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = serviceUserId;
  Object.assign(where, relatedServiceUserScopeWhere(req.user));

  const logs = await prisma.callLog.findMany({
    where,
    include,
    orderBy: { createdAt: 'desc' },
  });
  res.json(logs);
}

export async function updateCallLog(req: AuthRequest, res: Response) {
  const { note } = req.body;
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  // Editing the wording invalidates prior sign-offs: reset to just the editor,
  // so co-carers are asked to re-sign the changed note.
  const noteChanged = String(note).trim() !== existing.note;
  const data: Record<string, unknown> = { note: String(note).trim() };
  if (noteChanged) data.signedBy = JSON.stringify([await selfSignature(req)]);

  const log = await prisma.callLog.update({
    where: { id: req.params.id },
    data,
    include,
  });
  res.json(log);
}

export async function deleteCallLog(req: AuthRequest, res: Response) {
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  await prisma.callLog.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
