import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

// Audit actions that can be reversed from the log.
//  - SHIFT_DELETED: undoData holds a full snapshot of the (hard-)deleted rows;
//    undo re-creates them verbatim (Caremid deletes visits for real).
//  - SHIFT_CANCELLED: undoData holds each visit's pre-cancel status + billing
//    fields; undo restores them (un-cancels the visit).
const UNDOABLE_ACTIONS = new Set(['SHIFT_DELETED', 'SHIFT_CANCELLED']);

export async function listAudit(req: AuthRequest, res: Response) {
  const { from, to, q } = req.query as { from?: string; to?: string; q?: string };
  const where: Record<string, unknown> = {};

  // Date range (inclusive of the whole `to` day). Records are never deleted, so
  // filtering by date lets you retrieve history far older than the default page.
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) { const end = new Date(to); end.setUTCDate(end.getUTCDate() + 1); range.lt = end; }
    where.createdAt = range;
  }

  // Free-text search across the readable fields.
  const term = (q || '').trim();
  if (term) {
    where.OR = [
      { target: { contains: term, mode: 'insensitive' } },
      { details: { contains: term, mode: 'insensitive' } },
      { actorName: { contains: term, mode: 'insensitive' } },
      { action: { contains: term, mode: 'insensitive' } },
    ];
  }

  // With a filter applied, return everything that matches (up to a high cap);
  // unfiltered, keep the fast recent-200 default.
  const hasFilter = !!(from || to || term);
  const take = Math.min(Number(req.query.limit) || (hasFilter ? 5000 : 200), 10000);
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take });

  // Resolve each actor's current name from their id (actorName only ever stored
  // the email), so the log can show a readable name alongside the address —
  // works for historical entries too.
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))];
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  // Don't ship the raw undoData snapshot to the client — just whether the row can
  // still be undone, and when it was undone if so.
  res.json(logs.map(({ undoData, ...l }) => ({
    ...l,
    actorFullName: l.actorId ? (nameById.get(l.actorId) ?? null) : null,
    undoable: UNDOABLE_ACTIONS.has(l.action) && !l.undoneAt && !!undoData,
  })));
}

interface ShiftSnapshot {
  id: string;
  userId: string | null;
  serviceUserId: string | null;
  runId: string | null;
  seriesId: string | null;
  seriesPermanent: boolean;
  date: string;
  startTime: string;
  endTime: string;
  visitName: string | null;
  cover: number;
  role: string | null;
  notes: string | null;
  givesMedication: boolean;
  ecmNote: string | null;
  status: string;
  cancelBillable: boolean;
  cancelChargeType: string | null;
  cancelChargePercent: number | null;
  cancelChargeAmount: number | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  published: boolean;
  coverCarerIds: string[];
}

interface CancelSnapshot {
  id: string;
  status: string;
  cancelledAt: string | null;
  cancelBillable: boolean;
  cancelChargeType: string | null;
  cancelChargePercent: number | null;
  cancelChargeAmount: number | null;
  cancelReason: string | null;
}

// POST /audit/:id/undo — reverse an undoable audit entry. Supports SHIFT_DELETED
// (re-create the deleted visits) and SHIFT_CANCELLED (restore each visit's
// pre-cancel state). Any manager who can manage the schedule can undo (not only
// the original actor).
export async function undoAuditEntry(req: AuthRequest, res: Response) {
  const entry = await prisma.auditLog.findFirst({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Audit entry not found' });
  if (!UNDOABLE_ACTIONS.has(entry.action)) return res.status(400).json({ error: 'This action cannot be undone.' });
  if (entry.undoneAt) return res.status(400).json({ error: 'This entry has already been undone.' });
  if (!entry.undoData) return res.status(400).json({ error: 'No undo information was recorded for this entry.' });

  if (entry.action === 'SHIFT_CANCELLED') return undoCancel(req, res, entry.id, entry.undoData, entry.target);

  // --- SHIFT_DELETED: re-create the deleted visits from the snapshot ---
  let shifts: ShiftSnapshot[] = [];
  try {
    const parsed = JSON.parse(entry.undoData) as { shifts?: unknown };
    if (Array.isArray(parsed?.shifts)) shifts = parsed.shifts as ShiftSnapshot[];
  } catch {
    return res.status(400).json({ error: 'The undo information for this entry is unreadable.' });
  }
  if (shifts.length === 0) return res.status(400).json({ error: 'No visits to restore for this entry.' });

  // Validate every foreign key the snapshot references, so re-creating can't fail
  // on a since-deleted user/client/run. Missing optional FKs are nulled; a visit
  // whose client no longer exists is skipped (nothing to attach it to). Cover
  // carers that no longer exist are dropped.
  const userIds = new Set<string>();
  const suIds = new Set<string>();
  const runIds = new Set<string>();
  for (const s of shifts) {
    if (s.userId) userIds.add(s.userId);
    if (s.serviceUserId) suIds.add(s.serviceUserId);
    if (s.runId) runIds.add(s.runId);
    for (const c of s.coverCarerIds || []) userIds.add(c);
  }
  const [usersExist, susExist, runsExist, existing] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true } }),
    prisma.serviceUser.findMany({ where: { id: { in: [...suIds] } }, select: { id: true } }),
    prisma.run.findMany({ where: { id: { in: [...runIds] } }, select: { id: true } }),
    prisma.shift.findMany({ where: { id: { in: shifts.map((s) => s.id) } }, select: { id: true } }),
  ]);
  const userOk = new Set(usersExist.map((u) => u.id));
  const suOk = new Set(susExist.map((u) => u.id));
  const runOk = new Set(runsExist.map((r) => r.id));
  const already = new Set(existing.map((s) => s.id));

  // Re-create the scalar rows in one shot; anything already back (re-created
  // since, or a double-tap) is skipped.
  const toCreate = shifts.filter((s) => !already.has(s.id) && (!s.serviceUserId || suOk.has(s.serviceUserId)));
  if (toCreate.length > 0) {
    await prisma.shift.createMany({
      data: toCreate.map((s) => ({
        id: s.id,
        userId: s.userId && userOk.has(s.userId) ? s.userId : null,
        serviceUserId: s.serviceUserId ?? null,
        runId: s.runId && runOk.has(s.runId) ? s.runId : null,
        seriesId: s.seriesId ?? null,
        seriesPermanent: !!s.seriesPermanent,
        date: new Date(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        visitName: s.visitName ?? null,
        cover: s.cover ?? 1,
        role: s.role ?? null,
        notes: s.notes ?? null,
        givesMedication: s.givesMedication ?? true,
        ecmNote: s.ecmNote ?? null,
        status: s.status ?? 'SCHEDULED',
        cancelBillable: !!s.cancelBillable,
        cancelChargeType: s.cancelChargeType ?? null,
        cancelChargePercent: s.cancelChargePercent ?? null,
        cancelChargeAmount: s.cancelChargeAmount ?? null,
        cancelReason: s.cancelReason ?? null,
        cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null,
        published: s.published ?? true,
      })),
      skipDuplicates: true,
    });

    // Re-link cover carers (a per-shift many-to-many that createMany can't set).
    for (const s of toCreate) {
      const coverIds = (s.coverCarerIds || []).filter((c) => userOk.has(c));
      if (coverIds.length > 0) {
        await prisma.shift.update({ where: { id: s.id }, data: { coverCarers: { connect: coverIds.map((id) => ({ id })) } } });
      }
    }
  }

  await prisma.auditLog.update({
    where: { id: entry.id },
    data: { undoneAt: new Date(), undoneById: req.user?.id ?? null },
  });

  await logAudit(req, 'SHIFT_DELETE_UNDONE', entry.target ?? undefined, `${toCreate.length} visit(s) restored`);

  res.json({ restored: toCreate.length });
}

// Undo a SHIFT_CANCELLED entry: restore each visit's pre-cancel status + billing
// fields. Skips any visit that's no longer cancelled (changed since) or that has
// since landed on an invoice (a chargeable cancellation may already be billed —
// un-cancelling under it would desync the invoice, so we leave those).
async function undoCancel(req: AuthRequest, res: Response, entryId: string, undoData: string, target: string | null) {
  let cancels: CancelSnapshot[] = [];
  try {
    const parsed = JSON.parse(undoData) as { cancels?: unknown };
    if (Array.isArray(parsed?.cancels)) cancels = parsed.cancels as CancelSnapshot[];
  } catch {
    return res.status(400).json({ error: 'The undo information for this entry is unreadable.' });
  }
  if (cancels.length === 0) return res.status(400).json({ error: 'No visits to restore for this entry.' });

  const ids = cancels.map((c) => c.id);
  const [stillCancelled, billedLines] = await Promise.all([
    prisma.shift.findMany({ where: { id: { in: ids }, status: 'CANCELLED' }, select: { id: true } }),
    prisma.invoiceLine.findMany({ where: { sourceShiftId: { in: ids } }, select: { sourceShiftId: true } }),
  ]);
  const cancelledSet = new Set(stillCancelled.map((s) => s.id));
  const billedSet = new Set(billedLines.map((l) => l.sourceShiftId).filter((x): x is string => !!x));

  const restorable = cancels.filter((c) => cancelledSet.has(c.id) && !billedSet.has(c.id));

  // Group by identical restore payload so a big series collapses to one or two
  // updateMany calls instead of hundreds of single updates.
  const groups = new Map<string, { data: Record<string, unknown>; ids: string[] }>();
  for (const c of restorable) {
    const data = {
      status: c.status ?? 'SCHEDULED',
      cancelledAt: c.cancelledAt ? new Date(c.cancelledAt) : null,
      cancelBillable: !!c.cancelBillable,
      cancelChargeType: c.cancelChargeType ?? null,
      cancelChargePercent: c.cancelChargePercent ?? null,
      cancelChargeAmount: c.cancelChargeAmount ?? null,
      cancelReason: c.cancelReason ?? null,
    };
    const key = JSON.stringify(data);
    const g = groups.get(key) ?? { data, ids: [] as string[] };
    g.ids.push(c.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    await prisma.shift.updateMany({ where: { id: { in: g.ids } }, data: g.data });
  }

  await prisma.auditLog.update({
    where: { id: entryId },
    data: { undoneAt: new Date(), undoneById: req.user?.id ?? null },
  });

  const skipped = cancels.length - restorable.length;
  await logAudit(
    req,
    'SHIFT_CANCEL_UNDONE',
    target ?? undefined,
    `${restorable.length} visit(s) un-cancelled${skipped ? ` · ${skipped} skipped (invoiced or already changed)` : ''}`,
  );

  res.json({ restored: restorable.length, skipped });
}
