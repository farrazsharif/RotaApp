import { growSeries, loadRespiteLookup, SeriesShape } from './seriesGeneration';

// Keeps open-ended ("Permanent") recurring visits topped up so there are always
// ~12 months of future shifts. Runs at startup and once a day. Idempotent: a
// series that already reaches the window is skipped, so most runs do nothing.
//
// The generation itself lives in seriesGeneration.ts, shared with the
// extend-series endpoint so a topped-up series and an extended one are built
// the same way. What stays here is this job's own policy: which series to
// consider, how far ahead to reach, and what to do about a client who has been
// discharged or has died.
const WINDOW_MONTHS = 12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function topUpPermanentSeries(prisma: any): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const target = new Date(today.getFullYear(), today.getMonth() + WINDOW_MONTHS, today.getDate(), 12, 0, 0);

  const rows = await prisma.shift.findMany({
    where: { seriesPermanent: true, seriesId: { not: null }, status: { not: 'CANCELLED' } },
    select: { seriesId: true, date: true },
  });
  if (rows.length === 0) return;

  const inRespite = await loadRespiteLookup(prisma, today);

  // Group by series → the weekdays it recurs on and the furthest date so far.
  // Read in one query here rather than per series, then handed to growSeries so
  // it doesn't go back to the database for something already in memory.
  const bySeries = new Map<string, SeriesShape>();
  for (const r of rows) {
    const g = bySeries.get(r.seriesId) ?? { weekdays: new Set<number>(), latest: new Date(0) };
    const d = new Date(r.date);
    g.weekdays.add(d.getDay());
    if (d > g.latest) g.latest = d;
    bySeries.set(r.seriesId, g);
  }

  let created = 0;
  for (const [seriesId, shape] of bySeries) {
    if (shape.latest >= target) continue; // already far enough ahead

    // Don't keep generating future calls for someone who has been discharged or
    // has passed away — and clear any future calls still on the schedule for
    // them (also covers people marked before auto-cancel shipped). Only touch
    // shifts AFTER today (`gt`, not `gte`): today's calls are handled precisely
    // at discharge time (kept if before the End-of-Care moment, cancelled if
    // after), so this sweep must not wipe a call earlier today that was rightly
    // kept. `today` is noon-anchored, matching how shift dates are stored.
    const template = await prisma.shift.findFirst({
      where: { seriesId, status: { not: 'CANCELLED' } },
      orderBy: { date: 'desc' },
      select: { companyId: true, serviceUser: { select: { status: true } } },
    });
    // Without a tenant there is nothing to write under, so leave the series
    // alone entirely - as the original job did, rather than cancelling visits
    // through a write that has no company context.
    if (!template || !template.companyId) continue;
    if (template.serviceUser?.status === 'DECEASED' || template.serviceUser?.status === 'DISCHARGED') {
      await prisma.shift.updateMany({
        where: { seriesId, status: { not: 'CANCELLED' }, date: { gt: today } },
        data: { status: 'CANCELLED' },
      });
      continue;
    }

    const res = await growSeries(prisma, { seriesId, target, permanent: true, inRespite, shape });
    created += res.created;
  }

  if (created > 0) console.log(`Permanent top-up: generated ${created} future shift(s).`);
}
