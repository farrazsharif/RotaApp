import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitToUser, emitToCompany } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { runWithCompany } from '../lib/tenantContext';

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type Carer = { id: string; firstName: string; lastName: string };

// GET /api/runs — every run with its default team and a count of upcoming calls.
export async function listRuns(_req: AuthRequest, res: Response) {
  const runs = await prisma.run.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: { carers: { select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] } },
  });

  // Upcoming (today onward, not cancelled) call count per run — one grouped query.
  const counts = await prisma.shift.groupBy({
    by: ['runId'],
    where: { runId: { not: null }, status: { not: 'CANCELLED' }, date: { gte: startOfToday() } },
    _count: { _all: true },
  });
  const countMap = new Map<string, number>(counts.map((c) => [c.runId as string, c._count._all]));

  res.json(runs.map((r) => ({ ...r, upcomingCount: countMap.get(r.id) ?? 0 })));
}

export async function createRun(req: AuthRequest, res: Response) {
  const { name, color, carerIds } = req.body as { name?: string; color?: string; carerIds?: string[] };
  if (!name || !name.trim()) return res.status(400).json({ error: 'A run name is required' });

  const count = await prisma.run.count();
  const run = await prisma.run.create({
    data: {
      name: name.trim(),
      color: color || null,
      order: count,
      carers: Array.isArray(carerIds) && carerIds.length ? { connect: carerIds.filter(Boolean).map((id) => ({ id })) } : undefined,
    },
    include: { carers: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.status(201).json({ ...run, upcomingCount: 0 });
}

// Editing a run's team here is cheap — it does NOT touch existing shifts. Use
// applyRunTeam to push the team onto the run's calls (the explicit assign/cover
// action), so simply renaming a run never triggers a mass re-assignment.
export async function updateRun(req: AuthRequest, res: Response) {
  const { name, color, order, active, carerIds } = req.body as {
    name?: string; color?: string; order?: number; active?: boolean; carerIds?: string[];
  };
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'A run name is required' });
    data.name = name.trim();
  }
  if (color !== undefined) data.color = color || null;
  if (order !== undefined) data.order = Number(order) || 0;
  if (active !== undefined) data.active = !!active;
  if (Array.isArray(carerIds)) data.carers = { set: carerIds.filter(Boolean).map((id) => ({ id })) };

  const run = await prisma.run.update({
    where: { id: req.params.id },
    data,
    include: { carers: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json(run);
}

export async function deleteRun(req: AuthRequest, res: Response) {
  const run = await prisma.run.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Run not found' });
  // Untag the run's calls first so none are left pointing at a deleted run.
  await prisma.shift.updateMany({ where: { runId: req.params.id }, data: { runId: null } });
  await prisma.run.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}

// POST /api/runs/:id/apply-team — push the run's default team onto its calls.
// Rule: single-up calls are split round-robin across the team (so a two-person
// team shares a long run), and double/triple-up calls take the first N team
// members (worked together). Managers can still override any individual call.
// The propagation runs in the background so a large recurring run doesn't hold
// up the request; the schedule refreshes when it finishes.
export async function applyRunTeam(req: AuthRequest, res: Response) {
  const runId = req.params.id;
  const scope = String(req.body?.scope || 'future') === 'all' ? 'all' : 'future';

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { carers: { select: { id: true, firstName: true, lastName: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] } },
  });
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const dateWhere = scope === 'all' ? {} : { date: { gte: startOfToday() } };
  const targetCount = await prisma.shift.count({ where: { runId, status: { not: 'CANCELLED' }, ...dateWhere } });

  const companyId = req.user!.companyId;
  const job = () => applyTeamJob(runId, run.carers, scope, companyId).catch((e) => console.error('applyRunTeam failed:', e));
  if (companyId) runWithCompany(companyId, job);
  else job();

  res.json({ message: 'Applying the team to this run…', count: targetCount });
}

async function applyTeamJob(runId: string, team: Carer[], scope: 'all' | 'future', companyId?: string) {
  const dateWhere = scope === 'all' ? {} : { date: { gte: startOfToday() } };
  const shifts = await prisma.shift.findMany({
    where: { runId, status: { not: 'CANCELLED' }, ...dateWhere },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    include: { coverCarers: { select: { id: true } } },
  });
  if (shifts.length === 0) return;

  const teamIds = team.map((c) => c.id);
  const nameOf = new Map(team.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

  // Collapse per-carer so a whole run reassignment fires one notification each.
  const removed = new Map<string, { id: string; date: Date; startTime: string; endTime: string; visitName: string | null }[]>();
  const added = new Map<string, { id: string; date: Date; startTime: string; endTime: string; visitName: string | null }[]>();
  const push = (m: typeof removed, carerId: string, s: (typeof shifts)[number]) => {
    if (!m.has(carerId)) m.set(carerId, []);
    m.get(carerId)!.push({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, visitName: s.visitName });
  };

  let offset = 0;
  for (const shift of shifts) {
    const needed = shift.cover || 1;
    const picks: string[] = [];
    if (teamIds.length) {
      for (let k = 0; k < teamIds.length && picks.length < needed; k++) picks.push(teamIds[(offset + k) % teamIds.length]);
      offset = (offset + 1) % teamIds.length;
    }
    const primary = picks[0] ?? null;
    const coverIds = picks.slice(1);

    const before = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    const after = picks;
    if (before.length === after.length && before.every((id) => after.includes(id))) continue; // no change

    await prisma.shift.update({
      where: { id: shift.id },
      data: { userId: primary, coverCarers: { set: coverIds.map((id) => ({ id })) } },
    });

    for (const id of before) if (!after.includes(id)) push(removed, id, shift);
    // Only surface additions on already-published calls — draft calls aren't on
    // carers' rotas yet, so there's nothing to notify about.
    if (shift.published) for (const id of after) if (!before.includes(id)) push(added, id, shift);
  }

  const line = (s: { visitName: string | null; date: Date; startTime: string; endTime: string }) =>
    `${s.visitName || 'A call'} on ${new Date(s.date).toDateString()}, ${s.startTime}–${s.endTime}`;

  await Promise.all([
    ...[...removed.entries()].map(async ([carerId, list]) => {
      const message = list.length > 1 ? `You've been removed from ${list.length} calls on your rota` : `You've been removed from ${line(list[0])}`;
      const n = await prisma.notification.create({ data: { userId: carerId, type: 'SHIFT_REMOVED', title: 'Removed from Call', message, data: JSON.stringify({ shiftIds: list.map((s) => s.id) }) } });
      emitToUser(carerId, 'notification', n);
      await sendPushToUser(carerId, { title: 'Removed from Call', body: message });
    }),
    ...[...added.entries()].map(async ([carerId, list]) => {
      const message = list.length > 1 ? `${list.length} calls have been added to your rota` : `${line(list[0])} has been added to your rota`;
      const n = await prisma.notification.create({ data: { userId: carerId, type: 'SHIFT_PUBLISHED', title: 'New Call on Your Rota', message, data: JSON.stringify({ shiftIds: list.map((s) => s.id) }) } });
      emitToUser(carerId, 'notification', n);
      await sendPushToUser(carerId, { title: 'New Call on Your Rota', body: message, url: list.length === 1 ? `/call/${list[0].id}` : '/rota' });
    }),
  ]);

  // Nudge every open portal session to refetch now the background work is done.
  if (companyId) emitToCompany(companyId, 'data:changed', { resource: '/api/runs' });
}
