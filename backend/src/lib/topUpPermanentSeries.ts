// Keeps open-ended ("Permanent") recurring visits topped up so there are always
// ~12 months of future shifts. Runs at startup and once a day. Idempotent: a
// series that already reaches the window is skipped, so most runs do nothing.
//
// There is no separate "series" table — the recurrence is inferred from the
// series' existing shifts: the set of weekdays they fall on, and the latest one
// (used as the template for times / patient / carer / visit name). New shifts
// copy the template's companyId explicitly so the tenant Prisma extension
// allows the background write.
const WINDOW_MONTHS = 12;

export async function topUpPermanentSeries(prisma: any): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const target = new Date(today.getFullYear(), today.getMonth() + WINDOW_MONTHS, today.getDate(), 12, 0, 0);

  const rows = await prisma.shift.findMany({
    where: { seriesPermanent: true, seriesId: { not: null }, status: { not: 'CANCELLED' } },
    select: { seriesId: true, date: true },
  });
  if (rows.length === 0) return;

  // Group by series → the weekdays it recurs on and the furthest date so far.
  const bySeries = new Map<string, { weekdays: Set<number>; latest: Date }>();
  for (const r of rows) {
    const g = bySeries.get(r.seriesId) ?? { weekdays: new Set<number>(), latest: new Date(0) };
    const d = new Date(r.date);
    g.weekdays.add(d.getDay());
    if (d > g.latest) g.latest = d;
    bySeries.set(r.seriesId, g);
  }

  let created = 0;
  for (const [seriesId, info] of bySeries) {
    if (info.latest >= target) continue; // already far enough ahead

    const template = await prisma.shift.findFirst({
      where: { seriesId, status: { not: 'CANCELLED' } },
      orderBy: { date: 'desc' },
      include: { coverCarers: { select: { id: true } }, serviceUser: { select: { status: true } } },
    });
    if (!template || !template.companyId) continue; // need a tenant to create under
    // Don't keep generating future calls for someone who has passed away — and
    // clear any future calls still on the schedule for them (covers people
    // marked deceased before auto-cancel shipped).
    if (template.serviceUser?.status === 'DECEASED') {
      await prisma.shift.updateMany({
        where: { seriesId, status: { not: 'CANCELLED' }, date: { gte: today } },
        data: { status: 'CANCELLED' },
      });
      continue;
    }

    // Every matching weekday strictly after the latest shift, up to the window.
    const dates: Date[] = [];
    const cur = new Date(info.latest);
    cur.setDate(cur.getDate() + 1);
    while (cur <= target) {
      if (info.weekdays.has(cur.getDay())) {
        dates.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 12, 0, 0));
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length === 0) continue;

    const base = {
      companyId: template.companyId,
      userId: template.userId,
      serviceUserId: template.serviceUserId,
      seriesId,
      seriesPermanent: true,
      startTime: template.startTime,
      endTime: template.endTime,
      visitName: template.visitName,
      cover: template.cover,
      role: template.role,
      notes: template.notes,
      runId: template.runId, // keep future occurrences in the same run
      status: 'SCHEDULED',
      published: template.published,
    };

    const coverIds: string[] = (template.coverCarers ?? []).map((c: { id: string }) => c.id);
    if (coverIds.length === 0) {
      const r = await prisma.shift.createMany({ data: dates.map((d) => ({ ...base, date: d })) });
      created += r.count;
    } else {
      // Cover carers are a many-to-many relation — create individually to connect.
      for (const d of dates) {
        await prisma.shift.create({ data: { ...base, date: d, coverCarers: { connect: coverIds.map((id) => ({ id })) } } });
        created++;
      }
    }
  }

  if (created > 0) console.log(`Permanent top-up: generated ${created} future shift(s).`);
}
