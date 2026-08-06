import { Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { emitToUser, emitToCompany } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { isScoped, serviceUserInScope, relatedServiceUserScopeWhere } from '../lib/scope';
import { runWithCompany } from '../lib/tenantContext';
import { logAudit } from '../lib/audit';

const shiftInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  coverCarers: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true, address: true, postcode: true, status: true, statusUpdatedAt: true, statusChanges: { select: { status: true, effectiveAt: true }, orderBy: { effectiveAt: 'asc' as const } }, site: { select: { id: true, name: true, color: true, order: true } } } },
  run: { select: { id: true, name: true, color: true } },
  clockRecords: { select: { id: true, userId: true, clockIn: true, clockOut: true } },
};

// Apply a cover-carers change (connect or set) to many shifts without building
// one giant transaction. The many-to-many relation can't be touched by
// updateMany, so it must go per row — but hundreds of rows in a single
// transaction over a remote DB is exactly what timed out. Chunking keeps each
// transaction small and bounded.
async function applyCoverCarersChunked(shiftIds: string[], data: Record<string, unknown>): Promise<void> {
  // Batch the per-shift cover writes into transactions. With the paid, co-located
  // Neon instance (same Frankfurt region as the API, autoscaling to 8 CU) larger
  // batches are comfortable and mean fewer round-trips, so the background fan-out
  // finishes sooner. Kept bounded so a single transaction never grows unwieldy.
  const CHUNK = 100;
  for (let i = 0; i < shiftIds.length; i += CHUNK) {
    const slice = shiftIds.slice(i, i + CHUNK);
    await prisma.$transaction(slice.map((id) => prisma.shift.update({ where: { id }, data })));
  }
}

export async function listShifts(req: AuthRequest, res: Response) {
  const { startDate, endDate, userId, serviceUserId } = req.query;
  const where: Record<string, unknown> = {};

  // "My rota" = a carer viewing their own shifts (the carer app always passes
  // its own userId). Trigger the carer view for EMPLOYEE role OR whenever the
  // requested userId is the caller's own id — so carers with a custom role
  // (whose role isn't the literal 'EMPLOYEE') still get their cover calls.
  const viewingOwn = userId !== undefined && String(userId) === req.user!.id;
  if (req.user!.role === Role.EMPLOYEE || viewingOwn) {
    // Include calls they're the primary carer on AND calls they cover (2nd/3rd
    // carer on a double/triple-up call) — matching the Today screen. Without the
    // cover match, cover calls silently went missing.
    where.OR = [{ userId: req.user!.id }, { coverCarers: { some: { id: req.user!.id } } }];
    // Carers only ever see published shifts — drafts stay manager-only until published.
    where.published = true;
  } else if (userId) {
    // A manager pulling one carer's rota wants their cover calls too, not just
    // the ones they're primary on — includeCover switches to the OR match.
    if (req.query.includeCover === '1' || req.query.includeCover === 'true') {
      where.OR = [{ userId: String(userId) }, { coverCarers: { some: { id: String(userId) } } }];
    } else {
      where.userId = userId;
    }
  }

  if (serviceUserId) where.serviceUserId = String(serviceUserId);

  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate as string);
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate as string);
  }

  // Scoped managers only see shifts for service users in their sites.
  Object.assign(where, relatedServiceUserScopeWhere(req.user));

  const shifts = await prisma.shift.findMany({
    where,
    include: shiftInclude,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  res.json(shifts);
}

export async function getShift(req: AuthRequest, res: Response) {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id }, include: shiftInclude });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!(await serviceUserInScope(req.user, shift.serviceUserId))) return res.status(404).json({ error: 'Shift not found' });
  res.json(shift);
}

// Parse a 'yyyy-mm-dd' string into a local Date at midday (avoids timezone day-shift).
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

interface Repeat {
  daysOfWeek: number[]; // 0 = Sunday … 6 = Saturday
  endType: 'date' | 'permanent';
  endDate?: string;
}

// Expand a recurring visit into one date per matching weekday up to the end date
// (permanent recurrences are capped at 1 year ahead).
function buildRecurringDates(startStr: string, repeat: Repeat): Date[] {
  const start = parseLocalDate(startStr);
  const end =
    repeat.endType === 'date' && repeat.endDate
      ? parseLocalDate(repeat.endDate)
      : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), 12, 0, 0);

  const dates: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (repeat.daysOfWeek.includes(cur.getDay())) dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates.length ? dates : [start];
}

export async function createShift(req: AuthRequest, res: Response) {
  const { userId, serviceUserId, date, startTime, endTime, visitName, cover, coverCarerIds, role, notes, repeat, runId, givesMedication } = req.body;
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: 'date, startTime, endTime required' });
  }
  if (!serviceUserId) {
    return res.status(400).json({ error: 'A service user (patient) is required' });
  }
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(403).json({ error: 'That service user is outside your assigned sites' });
  }

  const baseData = {
    userId: userId || null,
    serviceUserId: serviceUserId || null,
    startTime,
    endTime,
    visitName: visitName || null,
    cover: Number(cover) || 1,
    role: role || null,
    notes: notes || null,
    givesMedication: givesMedication !== false,
    runId: runId || null,
    // New shifts start as drafts — carers won't see them until a manager
    // explicitly publishes (see publishShift / publishBulkShifts below).
    published: false,
  };

  const coverConnect = Array.isArray(coverCarerIds) && coverCarerIds.length
    ? { coverCarers: { connect: coverCarerIds.filter(Boolean).map((id: string) => ({ id })) } }
    : {};

  const useRepeat = repeat && Array.isArray(repeat.daysOfWeek) && repeat.daysOfWeek.length > 0;
  const permanent = !!(useRepeat && (repeat as Repeat).endType === 'permanent');
  const dates = useRepeat ? buildRecurringDates(date, repeat as Repeat) : [new Date(date)];
  const seriesId = useRepeat ? randomUUID() : null;
  const hasCoverCarers = Array.isArray(coverCarerIds) && coverCarerIds.filter(Boolean).length > 0;

  const t0 = Date.now();
  let shift;
  let createdCount: number;

  if (dates.length === 1) {
    // A single visit — one insert, with any cover carers connected inline.
    shift = await prisma.shift.create({
      data: { ...baseData, ...coverConnect, seriesId, seriesPermanent: permanent, date: dates[0] },
      include: shiftInclude,
    });
    createdCount = 1;
  } else {
    // Recurring series: bulk-INSERT every occurrence in one query (fast even for
    // a 12-month permanent repeat), then attach cover carers separately in
    // chunks. Doing this as hundreds of individual creates in a single
    // transaction is what previously timed out and rolled the whole save back.
    const ids = dates.map(() => randomUUID());
    await prisma.shift.createMany({
      data: dates.map((d, i) => ({ ...baseData, id: ids[i], seriesId, seriesPermanent: permanent, date: d })),
    });
    createdCount = ids.length;
    if (hasCoverCarers) {
      const connect = coverCarerIds.filter(Boolean).map((id: string) => ({ id }));
      // Attach cover to the first occurrence synchronously (it's the shift we
      // return), then fan the rest out in the background so a large double/triple
      // cover permanent series doesn't hold the request open past the gateway
      // timeout. Sessions reconcile via the data:changed broadcast when it ends.
      await applyCoverCarersChunked([ids[0]], { coverCarers: { connect } });
      const rest = ids.slice(1);
      if (rest.length > 0) {
        const companyId = req.user!.companyId;
        const run = () => applyCoverCarersChunked(rest, { coverCarers: { connect } })
          .then(() => { if (companyId) emitToCompany(companyId, 'data:changed', { resource: '/api/shifts' }); })
          .catch((e) => console.error('createShift cover fan-out failed:', e));
        if (companyId) runWithCompany(companyId, run); else run();
      }
    }
    shift = await prisma.shift.findFirst({ where: { seriesId }, orderBy: { date: 'asc' }, include: shiftInclude });
  }
  if (createdCount > 20) console.log(`[shift] createShift count=${createdCount} cover=${hasCoverCarers} ms=${Date.now() - t0}`);

  // Notify the assigned carer, if one was set (a single summary notification for recurring visits)
  if (userId && shift) {
    const message =
      createdCount > 1
        ? `You have ${createdCount} new shifts scheduled, starting ${new Date(date).toDateString()} (${startTime}–${endTime})`
        : `You have a new shift on ${new Date(date).toDateString()} from ${startTime} to ${endTime}`;
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: 'SHIFT_ASSIGNED',
        title: createdCount > 1 ? 'New Shifts Assigned' : 'New Shift Assigned',
        message,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(userId, 'notification', notification);
  }

  res.status(201).json({ ...shift, createdCount });
}

// Resolve which shifts a series-wide carer change should touch. Matches by the
// visit's identity (patient + name + times + role) rather than the fragile
// hidden seriesId, so old or split series still get every future occurrence.
async function resolveVisitShiftIds(
  shift: { serviceUserId: string | null; visitName: string | null; startTime: string; endTime: string; role: string | null; date: Date },
  scope: string,
  days: number[],
  fromDate?: string,
  toDate?: string,
): Promise<string[]> {
  const visitMatch = {
    serviceUserId: shift.serviceUserId,
    visitName: shift.visitName,
    startTime: shift.startTime,
    endTime: shift.endTime,
    role: shift.role,
    status: { not: 'CANCELLED' as const },
  };
  if (scope === 'range') {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : shift.date;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : from;
    const inRange = await prisma.shift.findMany({ where: { ...visitMatch, date: { gte: from, lte: to } }, select: { id: true } });
    return inRange.map((s) => s.id);
  }
  const later = await prisma.shift.findMany({ where: { ...visitMatch, date: { gte: shift.date } }, select: { id: true, date: true } });
  if (scope === 'future') return later.map((s) => s.id);
  if (scope === 'days') {
    // Optional end date: "certain weekdays, from this date until <toDate>".
    const until = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return later
      .filter((s) => days.includes(new Date(s.date).getDay()))
      .filter((s) => !until || new Date(s.date) <= until)
      .map((s) => s.id);
  }
  return [];
}

export async function updateShift(req: AuthRequest, res: Response) {
  const { date, startTime, endTime, visitName, cover, coverCarerIds, role, notes, status, serviceUserId, userId, runId, givesMedication,
    assignScope, assignDays, assignFrom, assignTo } = req.body;
  // Whether this edit should also apply to future occurrences of the same visit.
  const propagate = assignScope === 'days' || assignScope === 'future' || assignScope === 'range';

  if (isScoped(req.user)) {
    const cur = await prisma.shift.findUnique({ where: { id: req.params.id }, select: { serviceUserId: true } });
    if (!cur || !(await serviceUserInScope(req.user, cur.serviceUserId))) return res.status(404).json({ error: 'Shift not found' });
    if (serviceUserId !== undefined && !(await serviceUserInScope(req.user, serviceUserId))) {
      return res.status(403).json({ error: 'That service user is outside your assigned sites' });
    }
  }

  // Capture who's assigned before the update so we can tell, after it,
  // which of them got taken off (this endpoint sets the full assignment
  // each save, so a removal is just "was there before, isn't there now").
  const touchesAssignment = userId !== undefined || Array.isArray(coverCarerIds);
  // The shift's current state — for removal notifications and, crucially, to
  // match sibling visits by their ORIGINAL identity before this edit changes the
  // time/name (matching after the update would find nothing).
  const original = (touchesAssignment || propagate)
    ? await prisma.shift.findUnique({ where: { id: req.params.id }, include: { coverCarers: { select: { id: true } } } })
    : null;
  const before = touchesAssignment ? original : null;

  // Resolve future siblings (same visit) BEFORE the update, so a time/name/etc.
  // change can apply across "certain weekdays" / "all future", not just this call.
  let siblingIds: string[] = [];
  if (propagate && original) {
    const ids = await resolveVisitShiftIds(original, assignScope, Array.isArray(assignDays) ? assignDays.map(Number) : [], assignFrom, assignTo);
    siblingIds = ids.filter((id) => id !== req.params.id);
  }

  const data: Record<string, unknown> = {};
  if (date !== undefined) data.date = new Date(date);
  if (userId !== undefined) data.userId = userId || null;
  if (serviceUserId !== undefined) data.serviceUserId = serviceUserId || null;
  if (startTime !== undefined) data.startTime = startTime;
  if (endTime !== undefined) data.endTime = endTime;
  if (visitName !== undefined) data.visitName = visitName || null;
  if (cover !== undefined) data.cover = Number(cover) || 1;
  if (Array.isArray(coverCarerIds)) {
    data.coverCarers = { set: coverCarerIds.filter(Boolean).map((id: string) => ({ id })) };
  }
  if (role !== undefined) data.role = role;
  if (notes !== undefined) data.notes = notes;
  if (givesMedication !== undefined) data.givesMedication = !!givesMedication;
  if (status !== undefined) data.status = status;
  if (runId !== undefined) data.runId = runId || null;

  const shift = await prisma.shift.update({ where: { id: req.params.id }, data, include: shiftInclude });

  // Apply the edited visit fields to the matched future siblings. The date stays
  // per-occurrence, the patient/identity is fixed, and the carer is propagated
  // separately by the assign step — so only the visit's own details roll forward.
  if (siblingIds.length > 0) {
    const sibData: Record<string, unknown> = {};
    if (startTime !== undefined) sibData.startTime = startTime;
    if (endTime !== undefined) sibData.endTime = endTime;
    if (visitName !== undefined) sibData.visitName = visitName || null;
    if (cover !== undefined) sibData.cover = Number(cover) || 1;
    if (role !== undefined) sibData.role = role;
    if (notes !== undefined) sibData.notes = notes;
    if (givesMedication !== undefined) sibData.givesMedication = !!givesMedication;
    if (runId !== undefined) sibData.runId = runId || null;
    if (Object.keys(sibData).length > 0) {
      await prisma.shift.updateMany({ where: { id: { in: siblingIds } }, data: sibData });
    }
  }

  if (shift.userId) {
    const notification = await prisma.notification.create({
      data: {
        userId: shift.userId,
        type: 'SHIFT_UPDATED',
        title: 'Shift Updated',
        message: `Your shift on ${new Date(shift.date).toDateString()} has been updated`,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(shift.userId, 'notification', notification);
  }

  if (before) {
    const beforeIds = [before.userId, ...before.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    const afterIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    const removedIds = beforeIds.filter((id) => !afterIds.includes(id));
    await notifyCarersRemoved(removedIds.map((carerId) => ({ carerId, shift })));
  }

  res.json(shift);
}

// Build the cancellation billing fields from a request (query for DELETE, body
// for bulk POST). Non-chargeable by default so nothing bills by accident.
function cancelBillingData(src: Record<string, unknown>): {
  status: string; cancelledAt: Date; cancelBillable: boolean;
  cancelChargeType: string | null; cancelChargePercent: number | null;
  cancelChargeAmount: number | null; cancelReason: string | null;
} {
  const billable = src.billable === true || src.billable === '1' || src.billable === 'true';
  const rawType = String(src.chargeType || 'FULL').toUpperCase();
  const chargeType = billable ? (['FULL', 'PERCENT', 'CUSTOM'].includes(rawType) ? rawType : 'FULL') : null;
  const reason = src.reason != null ? String(src.reason).trim() : '';
  return {
    status: 'CANCELLED',
    cancelledAt: new Date(),
    cancelBillable: billable,
    cancelChargeType: chargeType,
    cancelChargePercent: chargeType === 'PERCENT' ? Number(src.chargePercent) || 0 : null,
    cancelChargeAmount: chargeType === 'CUSTOM' ? Number(src.chargeAmount) || 0 : null,
    cancelReason: reason || null,
  };
}

export async function deleteShift(req: AuthRequest, res: Response) {
  // scope: 'one' (default) | 'future' (this + later in series) | 'days' (matching weekdays from this date)
  const scope = String(req.query.scope || 'one');
  const days = String(req.query.days || '')
    .split(',')
    .filter(Boolean)
    .map(Number);

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!(await serviceUserInScope(req.user, shift.serviceUserId))) return res.status(404).json({ error: 'Shift not found' });

  let idsToCancel: string[] = [shift.id];

  if (shift.seriesId && scope !== 'one') {
    const laterInSeries = await prisma.shift.findMany({
      where: { seriesId: shift.seriesId, date: { gte: shift.date }, status: { not: 'CANCELLED' } },
      select: { id: true, date: true },
    });
    if (scope === 'future') {
      idsToCancel = laterInSeries.map((s) => s.id);
    } else if (scope === 'days') {
      idsToCancel = laterInSeries.filter((s) => days.includes(new Date(s.date).getDay())).map((s) => s.id);
    }
  }

  // Hard delete (?hard=1): the shift was created in error and should be removed
  // entirely — distinct from cancelling, which keeps a CANCELLED record for
  // audit/billing. Refuse if it's already invoiced; that must be cancelled.
  const hard = req.query.hard === '1' || req.query.hard === 'true';
  if (hard) {
    const billed = await prisma.invoiceLine.count({ where: { sourceShiftId: { in: idsToCancel } } });
    if (billed > 0) {
      return res.status(400).json({ error: 'One or more of these visits are already on an invoice — cancel them instead of deleting.' });
    }
    // Reminder rows have no FK, so clear them explicitly. Handovers cascade;
    // call/clock/invoice links are SetNull per the schema.
    await prisma.shiftReminder.deleteMany({ where: { shiftId: { in: idsToCancel } } });
    await prisma.shift.deleteMany({ where: { id: { in: idsToCancel } } });
    if (shift.seriesId && scope === 'future') {
      await prisma.shift.updateMany({ where: { seriesId: shift.seriesId }, data: { seriesPermanent: false } });
    }
    if (shift.userId) {
      const count = idsToCancel.length;
      const message = count > 1 ? `${count} of your shifts have been removed` : `Your shift on ${new Date(shift.date).toDateString()} has been removed`;
      const notification = await prisma.notification.create({
        data: { userId: shift.userId, type: 'SHIFT_REMOVED', title: count > 1 ? 'Shifts Removed' : 'Shift Removed', message, data: JSON.stringify({ shiftId: shift.id }) },
      });
      emitToUser(shift.userId, 'notification', notification);
      await sendPushToUser(shift.userId, { title: notification.title, body: message });
    }
    return res.json({ message: 'Deleted', count: idsToCancel.length, deleted: true });
  }

  await prisma.shift.updateMany({ where: { id: { in: idsToCancel } }, data: cancelBillingData(req.query as Record<string, unknown>) });

  // Cancelling the rest of a recurring series ends it — stop the permanent
  // top-up so it doesn't regenerate the future occurrences we just removed.
  if (shift.seriesId && scope === 'future') {
    await prisma.shift.updateMany({ where: { seriesId: shift.seriesId }, data: { seriesPermanent: false } });
  }

  if (shift.userId) {
    const count = idsToCancel.length;
    const notification = await prisma.notification.create({
      data: {
        userId: shift.userId,
        type: 'SHIFT_CANCELLED',
        title: count > 1 ? 'Shifts Cancelled' : 'Shift Cancelled',
        message:
          count > 1
            ? `${count} of your shifts have been cancelled`
            : `Your shift on ${new Date(shift.date).toDateString()} has been cancelled`,
        data: JSON.stringify({ shiftId: shift.id }),
      },
    });
    emitToUser(shift.userId, 'notification', notification);
  }

  res.json({ message: 'Cancelled', count: idsToCancel.length });
}

// Assign (or clear) a carer across a recurring series.
// scope: 'one' (default) | 'future' (this + later in series) | 'days' (matching weekdays from this date)
export async function assignShiftCarer(req: AuthRequest, res: Response) {
  const { userId, coverCarerIds, scope, days, fromDate, toDate } = req.body as { userId?: string; coverCarerIds?: string[]; scope?: string; days?: number[]; fromDate?: string; toDate?: string };
  const dayList = Array.isArray(days) ? days.map(Number) : [];

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!(await serviceUserInScope(req.user, shift.serviceUserId))) return res.status(404).json({ error: 'Shift not found' });

  const t0 = Date.now();
  let ids: string[] = [shift.id];
  if (scope && scope !== 'one') {
    ids = await resolveVisitShiftIds(shift, scope, dayList, fromDate, toDate);
  }

  // Capture who's assigned on each touched shift before reassigning, so we
  // can tell afterwards who got dropped and notify them individually —
  // different shifts in the series can have had different carers.
  const beforeShifts = await prisma.shift.findMany({
    where: { id: { in: ids } },
    include: { coverCarers: { select: { id: true } } },
  });

  // Assign the primary carer to every matching shift in one query. This is the
  // hot path when assigning to many future shifts (e.g. "certain weekdays") —
  // updating them one-by-one in a transaction made saving take seconds.
  await prisma.shift.updateMany({ where: { id: { in: ids } }, data: { userId: userId || null } });

  const connectSet = Array.isArray(coverCarerIds) ? coverCarerIds.filter(Boolean).map((id) => ({ id })) : null;

  // Set the OPENED shift's cover carers synchronously so the edited call is
  // fully saved by the time we respond.
  if (connectSet && connectSet.length > 0) {
    await applyCoverCarersChunked([shift.id], { coverCarers: { set: connectSet } });
  }

  // Before-state of every touched shift, so the client can offer a one-click
  // Undo (e.g. after unassigning "all future" by mistake). Restored verbatim.
  const undoShifts = beforeShifts.map((s) => ({ id: s.id, userId: s.userId ?? null, coverCarerIds: s.coverCarers.map((c) => c.id) }));

  // Respond as soon as the assignment (and the opened shift's cover) is saved.
  if (ids.length > 20) console.log(`[shift] assignCarer scope=${scope} count=${ids.length} cover=${!!(connectSet && connectSet.length)} primary-ms=${Date.now() - t0}`);
  res.json({ message: 'Assigned', count: ids.length, undo: { shifts: undoShifts } });

  // Fan the cover carers (a per-shift many-to-many that can't be done in a
  // single query) out to the REST of the series in the background, so a large
  // double/triple-cover "all future" assignment can't hold the request open
  // past the gateway timeout. Every session refetches when it finishes via the
  // data:changed broadcast, so the true state always reconciles. Re-wrap in the
  // tenant context so the background writes stay company-scoped.
  const siblingIds = ids.filter((sid) => sid !== shift.id);
  const companyId = req.user!.companyId;
  const runFanout = () =>
    (async () => {
      if (connectSet && connectSet.length > 0) {
        if (siblingIds.length > 0) await applyCoverCarersChunked(siblingIds, { coverCarers: { set: connectSet } });
      } else if (connectSet) {
        // Explicitly clearing cover — only touch shifts that currently have any.
        const withCover = beforeShifts.filter((s) => s.coverCarers.length > 0).map((s) => s.id);
        if (withCover.length > 0) await applyCoverCarersChunked(withCover, { coverCarers: { set: [] } });
      }

      const removals = beforeShifts.flatMap((s) => {
        const beforeIds = [s.userId, ...s.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
        const afterCoverIds = Array.isArray(coverCarerIds) ? coverCarerIds.filter(Boolean) : s.coverCarers.map((c) => c.id);
        const afterIds = [userId, ...afterCoverIds].filter(Boolean) as string[];
        return beforeIds.filter((id) => !afterIds.includes(id)).map((carerId) => ({ carerId, shift: s }));
      });
      await notifyCarersRemoved(removals);

      if (userId) {
        const count = ids.length;
        const notification = await prisma.notification.create({
          data: {
            userId,
            type: 'SHIFT_ASSIGNED',
            title: count > 1 ? 'Shifts Assigned' : 'Shift Assigned',
            message: count > 1
              ? `You have been assigned to ${count} shifts`
              : `You have been assigned to the shift on ${new Date(shift.date).toDateString()}`,
            data: JSON.stringify({ shiftId: shift.id }),
          },
        });
        emitToUser(userId, 'notification', notification);
      }
      if (ids.length > 20) console.log(`[shift] assignCarer fan-out done count=${ids.length} total-ms=${Date.now() - t0}`);
    })()
      .then(() => { if (companyId) emitToCompany(companyId, 'data:changed', { resource: '/api/shifts' }); })
      .catch((e) => console.error('assignCarer background fan-out failed:', e));

  if (companyId) runWithCompany(companyId, runFanout); else runFanout();
}

// Undo an assignment change: put each shift's primary + cover carers back to the
// exact before-state returned by the assign call. Used by the "Undo" button on
// the schedule after a bulk assign/unassign.
export async function restoreShiftAssignments(req: AuthRequest, res: Response) {
  const { shifts } = req.body as { shifts?: { id: string; userId: string | null; coverCarerIds: string[] }[] };
  if (!Array.isArray(shifts) || shifts.length === 0) return res.status(400).json({ error: 'shifts array required' });

  // Only touch shifts in the caller's scope (tenant + site).
  const found = await prisma.shift.findMany({
    where: { id: { in: shifts.map((s) => s.id) } },
    select: { id: true, serviceUserId: true },
  });
  const inScope = new Set<string>();
  for (const f of found) {
    if (await serviceUserInScope(req.user, f.serviceUserId)) inScope.add(f.id);
  }
  const targets = shifts.filter((s) => inScope.has(s.id));
  if (targets.length === 0) return res.status(404).json({ error: 'No matching shifts' });

  // Restore the primary carer, grouped by userId so it's a few updateMany calls.
  const byUser = new Map<string | null, string[]>();
  for (const s of targets) {
    const k = s.userId ?? null;
    (byUser.get(k) ?? byUser.set(k, []).get(k)!).push(s.id);
  }
  for (const [uid, sids] of byUser) {
    await prisma.shift.updateMany({ where: { id: { in: sids } }, data: { userId: uid } });
  }
  // Restore cover carers, grouped by identical cover sets to chunk the m2m writes.
  const byCover = new Map<string, string[]>();
  for (const s of targets) {
    const key = [...s.coverCarerIds].sort().join(',');
    (byCover.get(key) ?? byCover.set(key, []).get(key)!).push(s.id);
  }
  for (const [key, sids] of byCover) {
    const cover = key ? key.split(',').map((id) => ({ id })) : [];
    await applyCoverCarersChunked(sids, { coverCarers: { set: cover } });
  }

  await logAudit(req, 'SHIFT_ASSIGNMENT_RESTORED', `${targets.length} visit${targets.length > 1 ? 's' : ''}`, 'Undo assignment change');
  if (req.user!.companyId) emitToCompany(req.user!.companyId, 'data:changed', { resource: '/api/shifts' });
  res.json({ message: 'Restored', count: targets.length });
}

// Cancel many shifts at once (e.g. everything currently shown on the schedule).
export async function cancelBulkShifts(req: AuthRequest, res: Response) {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const result = await prisma.shift.updateMany({
    where: { id: { in: ids }, status: { not: 'CANCELLED' }, ...relatedServiceUserScopeWhere(req.user) },
    data: cancelBillingData(req.body as Record<string, unknown>),
  });

  if (result.count > 0) {
    await logAudit(req, 'SHIFTS_CANCELLED_BULK', `${result.count} visit${result.count > 1 ? 's' : ''}`, 'Bulk cancel');
  }
  res.json({ message: 'Cancelled', count: result.count });
}

// A shift is fully assigned once it has as many carers (primary + cover) as
// its cover level requires — same rule the Schedule page uses to flag
// "needs staff". Only fully assigned shifts may be published to carers.
function isFullyAssigned(shift: { userId: string | null; cover: number; coverCarers: unknown[] }): boolean {
  const assigned = (shift.userId ? 1 : 0) + shift.coverCarers.length;
  const needed = shift.cover || 1;
  return assigned >= needed;
}

type NotifiableShift = { id: string; date: Date; startTime: string; endTime: string; visitName: string | null };

function singleShiftLine(shift: NotifiableShift): string {
  return `${shift.visitName || 'A call'} on ${new Date(shift.date).toDateString()}, ${shift.startTime}–${shift.endTime}`;
}

// Tell carers they've been taken off shifts they were previously assigned
// to — same in-app + push pairing as the other shift notifications, so it
// disappearing from their rota doesn't happen silently. Takes a flat list
// of (carer, shift) pairs and collapses everything for the same carer into
// one notification, so e.g. reassigning a whole recurring series doesn't
// fire a separate notification per shift.
async function notifyCarersRemoved(removals: { carerId: string; shift: NotifiableShift }[]) {
  const byCarer = new Map<string, NotifiableShift[]>();
  for (const { carerId, shift } of removals) {
    if (!byCarer.has(carerId)) byCarer.set(carerId, []);
    byCarer.get(carerId)!.push(shift);
  }

  await Promise.all(
    [...byCarer.entries()].map(async ([carerId, shifts]) => {
      const message =
        shifts.length > 1
          ? `You've been removed from ${shifts.length} shifts on your rota`
          : `You've been removed from ${singleShiftLine(shifts[0])}`;
      const notification = await prisma.notification.create({
        data: {
          userId: carerId,
          type: 'SHIFT_REMOVED',
          title: 'Removed from Shift',
          message,
          data: JSON.stringify({ shiftIds: shifts.map((s) => s.id) }),
        },
      });
      emitToUser(carerId, 'notification', notification);
      await sendPushToUser(carerId, { title: 'Removed from Shift', body: message });
    })
  );
}

// Tell carers their newly-published shifts are now live on their rota — an
// in-app notification plus a push so they see it even with the app closed.
// Takes every shift published in one action and collapses everything for
// the same carer into a single notification, so publishing a whole batch
// of calls (e.g. "Publish All Shown") doesn't fire one notification per
// shift per carer.
async function notifyShiftsPublished(
  shifts: (NotifiableShift & { userId: string | null; coverCarers: { id: string }[] })[],
  customMessage?: string,
) {
  const byCarer = new Map<string, NotifiableShift[]>();
  for (const shift of shifts) {
    const carerIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    for (const carerId of carerIds) {
      if (!byCarer.has(carerId)) byCarer.set(carerId, []);
      byCarer.get(carerId)!.push(shift);
    }
  }

  await Promise.all(
    [...byCarer.entries()].map(async ([carerId, carerShifts]) => {
      const base =
        carerShifts.length > 1
          ? `${carerShifts.length} new shifts have been added to your rota`
          : `${singleShiftLine(carerShifts[0])} has been added to your rota`;
      const message = customMessage ? `${base}\n\n${customMessage}` : base;
      const title = carerShifts.length > 1 ? 'New Shifts on Your Rota' : 'New Shift on Your Rota';
      const notification = await prisma.notification.create({
        data: {
          userId: carerId,
          type: 'SHIFT_PUBLISHED',
          title,
          message,
          data: JSON.stringify({ shiftIds: carerShifts.map((s) => s.id) }),
        },
      });
      emitToUser(carerId, 'notification', notification);
      await sendPushToUser(carerId, {
        title,
        body: message,
        url: carerShifts.length === 1 ? `/call/${carerShifts[0].id}` : '/rota',
      });
    })
  );
}

// Optionally tell the office (admins + managers) that a batch was published —
// a single summary each, with any custom message the publisher added.
async function notifyManagersPublished(count: number, customMessage?: string) {
  const managers = await prisma.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.MANAGER] }, active: true },
    select: { id: true },
  });
  const base = `${count} shift${count === 1 ? '' : 's'} published to the rota`;
  const message = customMessage ? `${base}\n\n${customMessage}` : base;
  await Promise.all(
    managers.map(async (m) => {
      const notification = await prisma.notification.create({
        data: { userId: m.id, type: 'SHIFT_PUBLISHED', title: 'Schedule Published', message, data: '{}' },
      });
      emitToUser(m.id, 'notification', notification);
      await sendPushToUser(m.id, { title: 'Schedule Published', body: message, url: '/schedule' });
    }),
  );
}

// Publish a single draft shift, making it visible to its assigned carer.
export async function publishShift(req: AuthRequest, res: Response) {
  const shift = await prisma.shift.findUnique({
    where: { id: req.params.id },
    include: { coverCarers: { select: { id: true } } },
  });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (!isFullyAssigned(shift)) {
    return res.status(400).json({ error: 'Assign a carer to every cover slot before publishing this call' });
  }

  const updated = await prisma.shift.update({
    where: { id: req.params.id },
    data: { published: true },
    include: shiftInclude,
  });
  await notifyShiftsPublished([updated]);
  res.json(updated);
}

// Publish many shifts at once (e.g. everything currently shown on the schedule).
// Shifts that aren't fully assigned are silently skipped rather than erroring,
// since this is meant for "publish everything ready" bulk actions.
export async function publishBulkShifts(req: AuthRequest, res: Response) {
  // notify: 'none' (publish silently) | 'carers' (default) | 'all' (carers +
  // office). message: an optional custom line added to each notification.
  const { ids, notify, message } = req.body as { ids?: string[]; notify?: string; message?: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }
  const notifyMode = notify === 'none' || notify === 'all' ? notify : 'carers';
  const customMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : undefined;

  const candidates = await prisma.shift.findMany({
    where: { id: { in: ids }, published: false, ...relatedServiceUserScopeWhere(req.user) },
    include: { coverCarers: { select: { id: true } } },
  });
  const publishable = candidates.filter(isFullyAssigned);
  const publishableIds = publishable.map((s) => s.id);
  const skipped = candidates.length - publishableIds.length;

  const result = publishableIds.length
    ? await prisma.shift.updateMany({ where: { id: { in: publishableIds } }, data: { published: true } })
    : { count: 0 };

  // Respond as soon as the shifts are published. Fan-out of in-app + push
  // notifications (a network round-trip per carer subscription) runs in the
  // background so a big "publish all" doesn't leave the button spinning —
  // carers' apps already refetch live via the data:changed broadcast. Re-wrap
  // in the tenant context so the background Prisma writes stay company-scoped.
  if (publishable.length && notifyMode !== 'none') {
    const companyId = req.user!.companyId;
    const run = () =>
      (async () => {
        await notifyShiftsPublished(publishable, customMessage);
        if (notifyMode === 'all') await notifyManagersPublished(publishable.length, customMessage);
      })().catch((e) => console.error('Publish notifications failed:', e));
    if (companyId) runWithCompany(companyId, run); else run();
  }

  if (result.count > 0) {
    const details = skipped > 0 ? `${skipped} skipped (not fully staffed)` : undefined;
    await logAudit(req, 'SHIFTS_PUBLISHED_BULK', `${result.count} visit${result.count > 1 ? 's' : ''}`, details);
  }
  res.json({ message: 'Published', count: result.count, skipped });
}

export async function bulkCreateShifts(req: AuthRequest, res: Response) {
  const { shifts } = req.body as { shifts: Array<{ userId: string; date: string; startTime: string; endTime: string; role?: string; notes?: string }> };
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: 'shifts array required' });
  }

  const created = await prisma.$transaction(
    shifts.map((s) =>
      prisma.shift.create({
        data: {
          userId: s.userId,
          date: new Date(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          role: s.role || null,
          notes: s.notes || null,
          published: false,
        },
        include: shiftInclude,
      })
    )
  );

  res.status(201).json(created);
}
