import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { serviceUserInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';

// The daily charts: food, fluid, repositioning, continence and skin.
//
// Written by carers on a doorstep, read by the office as a day or a week.
// Both halves of that matter: an entry has to take seconds to make, and the
// day has to add up to something a manager can act on - which is why fluid
// totals and repositioning gaps are computed here rather than left for a
// screen to work out.

export const CHART_KINDS = ['FLUID', 'FOOD', 'REPOSITION', 'CONTINENCE', 'SKIN'];
const PORTIONS = ['NONE', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'ALL'];
const POSITIONS = ['BACK', 'LEFT', 'RIGHT', 'CHAIR', 'STANDING', 'WALKING', 'OTHER'];
const CONTINENCE = ['URINE', 'BOWEL', 'BOTH', 'NONE', 'CATHETER'];
const SKIN_FINDINGS = ['INTACT', 'RED_BLANCHING', 'RED_NON_BLANCHING', 'BROKEN', 'BLISTER', 'BRUISE', 'RASH', 'OTHER'];

// A carer can correct their own entry for this long. After that it is the
// record of what was observed, and a correction belongs in a new entry with a
// note - the same rule a paper chart has always had.
const EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

function clean(v: unknown, max = 4000): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, max);
}

function oneOf(v: unknown, allowed: string[]): string | null {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : null;
}

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min || i > max ? null : i;
}

const entrySelect = {
  id: true,
  serviceUserId: true,
  kind: true,
  shiftId: true,
  occurredAt: true,
  amountMl: true,
  portion: true,
  description: true,
  position: true,
  continence: true,
  incontinent: true,
  stoolScale: true,
  padChanged: true,
  bodySite: true,
  skinFinding: true,
  refused: true,
  concern: true,
  notes: true,
  createdAt: true,
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
};

// Pulls the kind-specific fields out of a body, so create and update agree on
// what each kind is allowed to carry.
function fieldsFor(kind: string, b: Record<string, unknown>) {
  const data: Record<string, unknown> = {
    notes: clean(b.notes) ?? null,
    refused: b.refused === true,
    concern: b.concern === true,
  };

  if (kind === 'FLUID') {
    // 5 litres in one go is a typo, not a drink.
    data.amountMl = intOrNull(b.amountMl, 0, 5000);
    data.description = clean(b.description, 200) ?? null;
  }
  if (kind === 'FOOD') {
    data.portion = oneOf(b.portion, PORTIONS);
    data.description = clean(b.description, 200) ?? null;
  }
  if (kind === 'REPOSITION') {
    data.position = oneOf(b.position, POSITIONS);
    data.bodySite = clean(b.bodySite, 120) ?? null;
  }
  if (kind === 'CONTINENCE') {
    const what = oneOf(b.continence, CONTINENCE);
    data.continence = what;
    data.incontinent = b.incontinent === true;
    data.padChanged = b.padChanged === true;
    // Only meaningful alongside a bowel movement.
    data.stoolScale = what === 'BOWEL' || what === 'BOTH' ? intOrNull(b.stoolScale, 1, 7) : null;
  }
  if (kind === 'SKIN') {
    data.bodySite = clean(b.bodySite, 120) ?? null;
    data.skinFinding = oneOf(b.skinFinding, SKIN_FINDINGS);
    data.description = clean(b.description, 2000) ?? null;
    // Non-blanching redness is already pressure damage, whatever else the
    // carer ticked. Flagging it here means the office sees it without relying
    // on somebody on a doorstep knowing that.
    if (data.skinFinding === 'RED_NON_BLANCHING' || data.skinFinding === 'BROKEN' || data.skinFinding === 'BLISTER') {
      data.concern = true;
    }
  }
  return data;
}

// GET /api/charts/:serviceUserId?kind=FLUID&from=&to=
export async function listEntries(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const kind = oneOf(req.query.kind, CHART_KINDS);
  const from = clean(req.query.from, 40);
  const to = clean(req.query.to, 40);

  const where: Record<string, unknown> = { serviceUserId };
  if (kind) where.kind = kind;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    if (Object.keys(range).length) where.occurredAt = range;
  }

  const entries = await prisma.careChartEntry.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }],
    take: 1000,
    select: entrySelect,
  });
  res.json(entries);
}

// POST /api/charts/:serviceUserId — the carer's entry.
export async function createEntry(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const b = req.body as Record<string, unknown>;
  const kind = oneOf(b.kind, CHART_KINDS);
  if (!kind) return res.status(400).json({ error: 'Unknown chart' });

  const raw = clean(b.occurredAt, 40);
  const occurredAt = raw ? new Date(raw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return res.status(400).json({ error: 'That time is not valid.' });
  }
  // A chart entry for something that has not happened is a mistake, not a
  // record. Five minutes of slack for a clock that is slightly out.
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ error: 'That time is in the future.' });
  }

  const row = await prisma.careChartEntry.create({
    data: {
      serviceUserId,
      kind,
      recordedById: req.user!.id,
      shiftId: clean(b.shiftId, 60) ?? null,
      occurredAt,
      ...fieldsFor(kind, b),
    },
    select: entrySelect,
  });
  res.status(201).json(row);
}

// PATCH /api/charts/entry/:id — a correction, within the window.
export async function updateEntry(req: AuthRequest, res: Response) {
  const existing = await prisma.careChartEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }

  // A carer may fix their own slip for a while. The office can always correct
  // one, because somebody has to be able to fix a 1500ml typo.
  const isOffice = req.user!.role !== Role.EMPLOYEE;
  if (!isOffice) {
    if (existing.recordedById !== req.user!.id) {
      return res.status(403).json({ error: 'You can only change an entry you made.' });
    }
    if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
      return res.status(400).json({
        error: 'This entry is too old to change. Add a new one with a note saying what was wrong.',
      });
    }
  }

  const b = req.body as Record<string, unknown>;
  const data = fieldsFor(existing.kind, b);

  const raw = clean(b.occurredAt, 40);
  if (raw) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'That time is not valid.' });
    if (d.getTime() > Date.now() + 5 * 60 * 1000) return res.status(400).json({ error: 'That time is in the future.' });
    data.occurredAt = d;
  }

  const row = await prisma.careChartEntry.update({ where: { id: existing.id }, data, select: entrySelect });
  if (isOffice && existing.recordedById !== req.user!.id) {
    await logAudit(req, 'CHART_ENTRY_AMENDED', row.id, `${existing.kind} chart entry amended by the office`);
  }
  res.json(row);
}

// DELETE /api/charts/entry/:id — office only, and audited. A chart entry is a
// care record, so this is for one logged against the wrong person.
export async function deleteEntry(req: AuthRequest, res: Response) {
  const existing = await prisma.careChartEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await serviceUserInScope(req.user, existing.serviceUserId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  await prisma.careChartEntry.delete({ where: { id: existing.id } });
  await logAudit(req, 'CHART_ENTRY_DELETED', existing.id, `${existing.kind} chart entry deleted`);
  res.json({ ok: true });
}

// GET /api/charts/:serviceUserId/day?date=YYYY-MM-DD
//
// One person, one day, with the arithmetic already done. The totals are the
// reason these charts exist: a list of drinks tells a manager nothing, and
// "640ml of a 1500ml target" tells them to pick up the phone.
export async function getDay(req: AuthRequest, res: Response) {
  const serviceUserId = req.params.serviceUserId;
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }

  const dateStr = clean(req.query.date, 20) || new Date().toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'That date is not valid.' });
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const [client, entries] = await Promise.all([
    prisma.serviceUser.findUnique({
      where: { id: serviceUserId },
      select: { id: true, firstName: true, lastName: true, careCharts: true, fluidTargetMl: true, repositionHours: true },
    }),
    prisma.careChartEntry.findMany({
      where: { serviceUserId, occurredAt: { gte: start, lt: end } },
      orderBy: [{ occurredAt: 'asc' }],
      select: entrySelect,
    }),
  ]);
  if (!client) return res.status(404).json({ error: 'Service user not found' });

  const fluid = entries.filter((e) => e.kind === 'FLUID');
  const fluidTotal = fluid.reduce((sum, e) => sum + (e.amountMl ?? 0), 0);
  const repositions = entries.filter((e) => e.kind === 'REPOSITION');

  // The longest gap between repositions, measured across the day's entries.
  // Null when there are fewer than two - one entry says nothing about gaps.
  let longestGapMins: number | null = null;
  for (let i = 1; i < repositions.length; i += 1) {
    const gap = (repositions[i].occurredAt.getTime() - repositions[i - 1].occurredAt.getTime()) / 60000;
    if (longestGapMins === null || gap > longestGapMins) longestGapMins = Math.round(gap);
  }

  res.json({
    date: dateStr,
    client,
    entries,
    totals: {
      fluidMl: fluidTotal,
      fluidTargetMl: client.fluidTargetMl,
      fluidShortfall: client.fluidTargetMl ? Math.max(0, client.fluidTargetMl - fluidTotal) : null,
      foodOffered: entries.filter((e) => e.kind === 'FOOD').length,
      foodRefused: entries.filter((e) => e.kind === 'FOOD' && e.refused).length,
      repositions: repositions.length,
      longestGapMins,
      repositionHours: client.repositionHours,
      continenceEpisodes: entries.filter((e) => e.kind === 'CONTINENCE' && e.incontinent).length,
      concerns: entries.filter((e) => e.concern).length,
    },
  });
}
