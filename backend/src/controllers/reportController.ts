import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { loadOrgSettings } from './settingsController';
import { isScoped, relatedServiceUserScopeWhere, relatedStaffScopeWhere } from '../lib/scope';

function hoursWorked(clockIn: Date, clockOut: Date | null) {
  if (!clockOut) return 0;
  return (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
}

function shiftHours(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

export async function hoursReport(req: AuthRequest, res: Response) {
  const { startDate, endDate, userId } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const clockWhere: Record<string, unknown> = {
    clockIn: { gte: start, lte: end },
  };
  if (userId) clockWhere.userId = userId;
  Object.assign(clockWhere, relatedStaffScopeWhere(req.user));

  const records = await prisma.clockRecord.findMany({
    where: clockWhere,
    include: { user: { select: { id: true, firstName: true, lastName: true, hourlyRate: true } } },
    orderBy: { clockIn: 'asc' },
  });

  const summary: Record<string, { userId: string; name: string; totalHours: number; totalPay: number; records: number }> = {};
  for (const r of records) {
    const hours = hoursWorked(r.clockIn, r.clockOut);
    if (!summary[r.userId]) {
      summary[r.userId] = {
        userId: r.userId,
        name: `${r.user.firstName} ${r.user.lastName}`,
        totalHours: 0,
        totalPay: 0,
        records: 0,
      };
    }
    summary[r.userId].totalHours += hours;
    summary[r.userId].totalPay += hours * r.user.hourlyRate;
    summary[r.userId].records += 1;
  }

  res.json(Object.values(summary).map((s) => ({
    ...s,
    totalHours: Math.round(s.totalHours * 100) / 100,
    totalPay: Math.round(s.totalPay * 100) / 100,
  })));
}

export async function overtimeReport(req: AuthRequest, res: Response) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);
  const { overtimeThreshold } = await loadOrgSettings();
  const threshold = overtimeThreshold && overtimeThreshold > 0 ? overtimeThreshold : 40;

  const records = await prisma.clockRecord.findMany({
    where: { clockIn: { gte: start, lte: end }, clockOut: { not: null }, ...relatedStaffScopeWhere(req.user) },
    include: { user: { select: { id: true, firstName: true, lastName: true, hourlyRate: true } } },
  });

  const byUserWeek: Record<string, Record<string, number>> = {};
  for (const r of records) {
    const hours = hoursWorked(r.clockIn, r.clockOut);
    const weekStart = new Date(r.clockIn);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    if (!byUserWeek[r.userId]) byUserWeek[r.userId] = {};
    byUserWeek[r.userId][weekKey] = (byUserWeek[r.userId][weekKey] || 0) + hours;
  }

  const overtimeResult = [];
  for (const [userId, weeks] of Object.entries(byUserWeek)) {
    const user = records.find((r) => r.userId === userId)?.user;
    for (const [week, hours] of Object.entries(weeks)) {
      if (hours > threshold) {
        overtimeResult.push({
          userId,
          name: user ? `${user.firstName} ${user.lastName}` : userId,
          weekStarting: week,
          regularHours: threshold,
          overtimeHours: Math.round((hours - threshold) * 100) / 100,
          totalHours: Math.round(hours * 100) / 100,
        });
      }
    }
  }

  res.json(overtimeResult);
}

export async function coverageReport(req: AuthRequest, res: Response) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const shiftWhere: Record<string, unknown> = {
    date: { gte: start, lte: end },
    status: { not: 'CANCELLED' },
    ...relatedServiceUserScopeWhere(req.user),
  };

  const shifts = await prisma.shift.findMany({
    where: shiftWhere,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { date: 'asc' },
  });

  // Group by date
  const byDate: Record<string, { date: string; scheduledCount: number; scheduledHours: number; shifts: unknown[] }> = {};
  for (const s of shifts) {
    const dateKey = new Date(s.date).toISOString().split('T')[0];
    if (!byDate[dateKey]) {
      byDate[dateKey] = { date: dateKey, scheduledCount: 0, scheduledHours: 0, shifts: [] };
    }
    byDate[dateKey].scheduledCount++;
    byDate[dateKey].scheduledHours += shiftHours(s.startTime, s.endTime);
    byDate[dateKey].shifts.push({
      id: s.id, user: s.user, startTime: s.startTime, endTime: s.endTime, role: s.role, status: s.status,
    });
  }

  res.json(Object.values(byDate));
}

// Hours Scheduled Crib Sheet — per-carer rostered hours by weekday (Mon–Sun) for the period.
export async function scheduledHoursReport(req: AuthRequest, res: Response) {
  const { startDate, endDate, siteId, role, userId } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const where: Record<string, unknown> = { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } };
  if (siteId) where.serviceUser = { siteId: siteId as string };
  if (role) where.role = role as string;
  if (userId) where.OR = [{ userId: userId as string }, { coverCarers: { some: { id: userId as string } } }];
  // Scoped users are confined to their sites (overrides any siteId query).
  const suScope = relatedServiceUserScopeWhere(req.user);
  if (suScope.serviceUser) where.serviceUser = suScope.serviceUser;

  const shifts = await prisma.shift.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, hourlyRate: true } },
      coverCarers: { select: { id: true, firstName: true, lastName: true, hourlyRate: true } },
    },
    orderBy: { date: 'asc' },
  });

  type Row = { userId: string; name: string; hourlyRate: number; days: number[]; total: number; visits: number };
  const rows: Record<string, Row> = {};
  const ensure = (id: string, name: string, hourlyRate: number): Row => {
    if (!rows[id]) rows[id] = { userId: id, name, hourlyRate, days: [0, 0, 0, 0, 0, 0, 0], total: 0, visits: 0 };
    return rows[id];
  };

  for (const s of shifts) {
    const hours = shiftHours(s.startTime, s.endTime);
    const dow = (new Date(s.date).getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
    let carers = [
      ...(s.user ? [{ id: s.user.id, name: `${s.user.firstName} ${s.user.lastName}`, rate: s.user.hourlyRate }] : []),
      ...s.coverCarers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, rate: c.hourlyRate })),
    ];
    // The shift may have matched because *some* carer on it is the filtered
    // employee, but it can also have other carers — only attribute hours to
    // the one actually being filtered for.
    if (userId) carers = carers.filter((c) => c.id === userId);
    const targets = carers.length > 0 ? carers : [{ id: 'unassigned', name: 'Unassigned', rate: 0 }];
    for (const t of targets) {
      const row = ensure(t.id, t.name, t.rate);
      row.days[dow] += hours;
      row.total += hours;
      row.visits += 1;
    }
  }

  const result = Object.values(rows)
    .map((r) => ({
      ...r,
      days: r.days.map((h) => Math.round(h * 100) / 100),
      total: Math.round(r.total * 100) / 100,
      estPay: Math.round(r.total * r.hourlyRate * 100) / 100,
    }))
    // Real carers first (alphabetical), Unassigned pinned to the bottom.
    .sort((a, b) => (a.userId === 'unassigned' ? 1 : b.userId === 'unassigned' ? -1 : a.name.localeCompare(b.name)));

  res.json(result);
}

export async function cribSheetReport(req: AuthRequest, res: Response) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' }, ...relatedServiceUserScopeWhere(req.user) },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      coverCarers: { select: { id: true, firstName: true, lastName: true } },
      serviceUser: { select: { id: true, firstName: true, lastName: true, site: { select: { name: true } } } },
      clockRecords: { select: { userId: true, clockIn: true, clockOut: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  type Row = {
    employee: string;
    position: string;
    serviceUser: string;
    date: string;
    startTime: string;
    endTime: string;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
  };

  const rows: Row[] = [];

  for (const s of shifts) {
    const hours = shiftHours(s.startTime, s.endTime);
    const dateStr = new Date(s.date).toISOString().split('T')[0];
    const suName = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '—';
    const position = s.serviceUser?.site?.name ?? '—';

    const carers = [
      ...(s.user ? [s.user] : []),
      ...s.coverCarers,
    ];

    const targets = carers.length > 0 ? carers : [{ id: 'unassigned', firstName: 'Unassigned', lastName: '' }];

    for (const c of targets) {
      const clock = s.clockRecords.find((cr) => cr.userId === c.id);
      rows.push({
        employee: c.id === 'unassigned' ? 'Unassigned' : `${c.firstName} ${c.lastName}`.trim(),
        position,
        serviceUser: suName,
        date: dateStr,
        startTime: s.startTime,
        endTime: s.endTime,
        clockIn: clock?.clockIn ? new Date(clock.clockIn).toISOString() : null,
        clockOut: clock?.clockOut ? new Date(clock.clockOut).toISOString() : null,
        totalHours: Math.round(hours * 100) / 100,
      });
    }
  }

  res.json(rows);
}

// Distinct shift roles in use, for the Hours Scheduled report's Position filter.
export async function shiftRoles(req: AuthRequest, res: Response) {
  const rows = await prisma.shift.findMany({
    where: { role: { not: null }, ...relatedServiceUserScopeWhere(req.user) },
    select: { role: true },
    distinct: ['role'],
  });
  res.json(rows.map((r) => r.role).filter(Boolean).sort());
}

// Minutes between two HH:mm times (handles overnight).
function minsBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

// Electronic Call Monitoring: one row per carer-visit with scheduled vs actual
// (clocked) times, so the record submitted to the council reflects what actually
// happened. Short/missed visits are flagged for a documented reason (ecmNote) —
// the times themselves are never altered.
export async function ecmReport(req: AuthRequest, res: Response) {
  const { startDate, endDate, siteId, userId } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const where: Record<string, unknown> = {
    date: { gte: new Date(String(startDate)), lte: new Date(String(endDate)) },
    status: { not: 'CANCELLED' },
    ...relatedServiceUserScopeWhere(req.user),
  };
  if (siteId) where.serviceUser = { siteId: String(siteId) };
  if (userId) where.OR = [{ userId: String(userId) }, { coverCarers: { some: { id: String(userId) } } }];

  const shifts = await prisma.shift.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      coverCarers: { select: { id: true, firstName: true, lastName: true } },
      serviceUser: { select: { firstName: true, lastName: true, site: { select: { name: true } } } },
      clockRecords: { select: { userId: true, clockIn: true, clockOut: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  const rows = [];
  for (const s of shifts) {
    const scheduledMins = minsBetween(s.startTime, s.endTime);
    const suName = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '—';
    const siteName = s.serviceUser?.site?.name ?? '—';
    const carers = [...(s.user ? [s.user] : []), ...s.coverCarers];
    const targets = carers.length > 0 ? carers : [{ id: 'unassigned', firstName: 'Unassigned', lastName: '' }];

    for (const c of targets) {
      if (userId && c.id !== String(userId)) continue;
      const clock = s.clockRecords.find((cr) => cr.userId === c.id);
      const clockIn = clock?.clockIn ? new Date(clock.clockIn) : null;
      const clockOut = clock?.clockOut ? new Date(clock.clockOut) : null;
      const actualMins = clockIn && clockOut ? Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) : null;
      const status = !clockIn ? 'not_attended' : !clockOut ? 'no_clock_out' : 'attended';
      const variance = actualMins != null ? actualMins - scheduledMins : null;
      const short = actualMins != null && (actualMins < 15 || variance! <= -10);
      rows.push({
        shiftId: s.id,
        date: new Date(s.date).toISOString().slice(0, 10),
        serviceUser: suName,
        site: siteName,
        carer: c.id === 'unassigned' ? 'Unassigned' : `${c.firstName} ${c.lastName}`.trim(),
        visitName: s.visitName,
        scheduledStart: s.startTime,
        scheduledEnd: s.endTime,
        scheduledMins,
        clockIn: clockIn ? clockIn.toISOString() : null,
        clockOut: clockOut ? clockOut.toISOString() : null,
        actualMins,
        variance,
        status,
        short,
        ecmNote: s.ecmNote ?? '',
      });
    }
  }

  res.json(rows);
}

// Save the ECM reason/explanation for a visit. Never touches the clock times.
export async function saveEcmNote(req: AuthRequest, res: Response) {
  const { shiftId, note } = req.body as { shiftId?: string; note?: string };
  if (!shiftId) return res.status(400).json({ error: 'shiftId required' });
  await prisma.shift.update({ where: { id: shiftId }, data: { ecmNote: note || null } });
  res.json({ message: 'ok' });
}

// The individual visits behind the dashboard "Late / missed check-ins" count:
// today's assigned, still-scheduled visits whose start passed 15+ mins ago with
// no clock-in yet.
export async function lateCheckinsList(req: AuthRequest, res: Response) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: todayStart, lt: todayEnd }, status: 'SCHEDULED', userId: { not: null }, ...relatedServiceUserScopeWhere(req.user) },
    include: {
      user: { select: { firstName: true, lastName: true } },
      coverCarers: { select: { firstName: true, lastName: true } },
      serviceUser: { select: { firstName: true, lastName: true, phone: true } },
      clockRecords: { select: { id: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const rows = shifts
    .filter((s) => {
      if (s.clockRecords.length > 0) return false; // someone clocked in
      const [h, m] = s.startTime.split(':').map(Number);
      return nowMins - (h * 60 + m) >= 15;
    })
    .map((s) => {
      const [h, m] = s.startTime.split(':').map(Number);
      const carers = [s.user, ...s.coverCarers].filter(Boolean).map((c) => `${c!.firstName} ${c!.lastName}`);
      return {
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        visitName: s.visitName,
        serviceUserName: s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Unknown',
        serviceUserPhone: s.serviceUser?.phone ?? null,
        carers,
        minutesLate: nowMins - (h * 60 + m),
      };
    });

  res.json(rows);
}

export async function dashboardStats(req: AuthRequest, res: Response) {
  const now = new Date();
  // Anchor day maths to UTC — shift dates are stored at UTC midnight, so
  // grouping/labelling by UTC date keeps the coverage strip aligned.
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // Monday-anchored current week for the coverage strip.
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const weekEndExcl = new Date(weekStart);
  weekEndExcl.setUTCDate(weekEndExcl.getUTCDate() + 7);
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const suScope = relatedServiceUserScopeWhere(req.user);
  const staffScope = relatedStaffScopeWhere(req.user);
  const employeeSiteFilter = isScoped(req.user) ? { sites: { some: { id: { in: req.user!.siteIds } } } } : {};

  const [totalEmployees, pendingTimeOff, weekShifts, todayShifts, todayClock, missedMeds, trainingExpiring, importantSoon] = await Promise.all([
    prisma.user.count({ where: { active: true, role: 'EMPLOYEE', ...employeeSiteFilter } }),
    prisma.timeOffRequest.count({ where: { status: 'PENDING', ...staffScope } }),
    prisma.shift.findMany({ where: { date: { gte: weekStart, lt: weekEndExcl }, status: { not: 'CANCELLED' }, ...suScope }, select: { date: true, userId: true } }),
    prisma.shift.findMany({ where: { date: { gte: todayStart, lt: todayEnd }, status: { not: 'CANCELLED' }, ...suScope }, select: { id: true, startTime: true, userId: true, status: true } }),
    prisma.clockRecord.findMany({ where: { clockIn: { gte: todayStart } }, select: { shiftId: true } }),
    prisma.medAdministration.count({ where: { status: 'MISSED', scheduledFor: { gte: todayStart, lt: todayEnd }, ...suScope } }),
    prisma.training.count({ where: { expiresAt: { not: null, lte: in30 }, ...staffScope } }),
    prisma.importantDate.count({ where: { date: { gte: todayStart, lte: in30 }, ...staffScope } }),
  ]);

  const shiftsThisWeek = weekShifts.length;

  // Coverage per weekday: share of visits with a carer assigned.
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const coverage = DAY_LABELS.map((label, i) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    const forDay = weekShifts.filter((s) => s.date.toISOString().slice(0, 10) === dayStr);
    const filled = forDay.filter((s) => s.userId).length;
    return { day: label, date: dayStr, total: forDay.length, filled, pct: forDay.length ? Math.round((filled / forDay.length) * 100) : 100 };
  });

  const visitsToday = { total: todayShifts.length, completed: todayShifts.filter((s) => s.status === 'COMPLETED').length };
  const unassignedToday = todayShifts.filter((s) => !s.userId).length;

  // Late/missed: an assigned, still-scheduled visit whose start passed 15+ mins
  // ago with no clock-in yet.
  const clockedShiftIds = new Set(todayClock.map((c) => c.shiftId).filter(Boolean) as string[]);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const lateCheckins = todayShifts.filter((s) => {
    if (!s.userId || s.status !== 'SCHEDULED' || clockedShiftIds.has(s.id)) return false;
    const [h, m] = s.startTime.split(':').map(Number);
    return nowMins - (h * 60 + m) >= 15;
  }).length;

  res.json({
    totalEmployees,
    shiftsThisWeek,
    pendingTimeOff,
    visitsToday,
    unassignedToday,
    lateCheckins,
    missedMeds,
    expiringCompliance: trainingExpiring + importantSoon,
    coverage,
  });
}
