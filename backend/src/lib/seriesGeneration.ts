// Growing a recurring visit series forward.
//
// There is no "series" table — the recurrence is inferred from the shifts that
// already exist: the set of weekdays they fall on, and the latest one, which
// doubles as the template for times, patient, carer, visit name and run.
//
// Two callers share this, and they must behave identically or an extended
// series would differ from a topped-up one in ways nobody could explain:
//   - topUpPermanentSeries, which keeps open-ended series ~12 months ahead
//   - the extend-series endpoint, when the office is told a package has been
//     lengthened (a week's care becomes three)
// Policy stays with the caller: this generates occurrences and nothing else.

export interface RespiteLookup {
  (serviceUserId: string | null, at: Date): boolean;
}

// Respite windows still in effect, as a lookup. Visits are not regenerated into
// a period the client is away for.
export async function loadRespiteLookup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  from: Date,
): Promise<RespiteLookup> {
  const rows = await prisma.respitePeriod.findMany({
    where: { endAt: { gte: from } },
    select: { serviceUserId: true, startAt: true, endAt: true },
  });
  const bySU = new Map<string, { startAt: Date; endAt: Date }[]>();
  for (const r of rows) {
    const list = bySU.get(r.serviceUserId) ?? [];
    list.push({ startAt: new Date(r.startAt), endAt: new Date(r.endAt) });
    bySU.set(r.serviceUserId, list);
  }
  return (serviceUserId: string | null, at: Date): boolean => {
    if (!serviceUserId) return false;
    const list = bySU.get(serviceUserId);
    return !!list && list.some((w) => at >= w.startAt && at < w.endAt);
  };
}

export interface SeriesShape {
  weekdays: Set<number>;
  latest: Date;
}

// The weekdays a series recurs on, and how far it currently reaches. Cancelled
// occurrences are ignored: a cancelled Tuesday does not mean the series stopped
// running on Tuesdays.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readSeriesShape(prisma: any, seriesId: string): Promise<SeriesShape | null> {
  const rows = await prisma.shift.findMany({
    where: { seriesId, status: { not: 'CANCELLED' } },
    select: { date: true },
  });
  if (rows.length === 0) return null;
  const weekdays = new Set<number>();
  let latest = new Date(0);
  for (const r of rows) {
    const d = new Date(r.date);
    weekdays.add(d.getDay());
    if (d > latest) latest = d;
  }
  return { weekdays, latest };
}

export interface GrowOptions {
  seriesId: string;
  // Noon-anchored last date to generate up to, inclusive.
  target: Date;
  // What to stamp on the new rows. Open-ended series stay true so the daily
  // top-up keeps them going; a fixed extension does not.
  permanent: boolean;
  inRespite: RespiteLookup;
  // Shape and template, when the caller has already loaded them (the top-up
  // reads every series in one query rather than one query per series).
  shape?: SeriesShape;
}

export interface GrowResult {
  created: number;
  // Set when nothing was generated and it is worth saying why.
  reason?: 'no-series' | 'already-covered' | 'no-template' | 'all-respite';
}

// Generate every missing occurrence between the series' current end and the
// target date. Idempotent: a series that already reaches the target is left
// alone, so this is safe to call repeatedly.
export async function growSeries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  opts: GrowOptions,
): Promise<GrowResult> {
  const { seriesId, target, permanent, inRespite } = opts;

  const shape = opts.shape ?? (await readSeriesShape(prisma, seriesId));
  if (!shape) return { created: 0, reason: 'no-series' };
  if (shape.latest >= target) return { created: 0, reason: 'already-covered' };

  const template = await prisma.shift.findFirst({
    where: { seriesId, status: { not: 'CANCELLED' } },
    orderBy: { date: 'desc' },
    include: { coverCarers: { select: { id: true } }, serviceUser: { select: { status: true } } },
  });
  // Without a tenant there is nothing to create under — the Prisma extension
  // would reject the write.
  if (!template || !template.companyId) return { created: 0, reason: 'no-template' };

  // Every matching weekday strictly after the latest shift, up to the target.
  // Respite days are skipped, matched at the template's start time so a
  // boundary day falls on the right side of the window.
  const [th, tm] = String(template.startTime || '00:00').split(':').map(Number);
  const dates: Date[] = [];
  const cur = new Date(shape.latest);
  cur.setDate(cur.getDate() + 1);
  while (cur <= target) {
    if (shape.weekdays.has(cur.getDay())) {
      const at = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), th || 0, tm || 0, 0);
      if (!inRespite(template.serviceUserId, at)) {
        dates.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0, 0));
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (dates.length === 0) return { created: 0, reason: 'all-respite' };

  const base = {
    companyId: template.companyId,
    userId: template.userId,
    serviceUserId: template.serviceUserId,
    seriesId,
    seriesPermanent: permanent,
    startTime: template.startTime,
    endTime: template.endTime,
    visitName: template.visitName,
    cover: template.cover,
    role: template.role,
    notes: template.notes,
    runId: template.runId, // keep future occurrences in the same run
    status: 'SCHEDULED',
    // Match the occurrences already on the schedule rather than creating
    // drafts: the carer is already rostered on this series, and a run of
    // invisible visits in the middle of a live package is worse than a run of
    // visible ones.
    published: template.published,
  };

  const coverIds: string[] = (template.coverCarers ?? []).map((c: { id: string }) => c.id);
  if (coverIds.length === 0) {
    const r = await prisma.shift.createMany({ data: dates.map((d) => ({ ...base, date: d })) });
    return { created: r.count };
  }
  // Cover carers are a many-to-many relation, which createMany cannot connect.
  let created = 0;
  for (const d of dates) {
    await prisma.shift.create({
      data: { ...base, date: d, coverCarers: { connect: coverIds.map((id) => ({ id })) } },
    });
    created++;
  }
  return { created };
}
