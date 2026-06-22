import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

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

  const records = await prisma.clockRecord.findMany({
    where: { clockIn: { gte: start, lte: end }, clockOut: { not: null } },
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
      if (hours > 40) {
        overtimeResult.push({
          userId,
          name: user ? `${user.firstName} ${user.lastName}` : userId,
          weekStarting: week,
          regularHours: 40,
          overtimeHours: Math.round((hours - 40) * 100) / 100,
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
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  const start = new Date(startDate as string);
  const end = new Date(endDate as string);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
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
    const carers = [
      ...(s.user ? [{ id: s.user.id, name: `${s.user.firstName} ${s.user.lastName}`, rate: s.user.hourlyRate }] : []),
      ...s.coverCarers.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, rate: c.hourlyRate })),
    ];
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
    where: { date: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
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

export async function dashboardStats(req: AuthRequest, res: Response) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [totalEmployees, shiftsThisWeek, pendingTimeOff, pendingTrades] = await Promise.all([
    prisma.user.count({ where: { active: true, role: 'EMPLOYEE' } }),
    prisma.shift.count({ where: { date: { gte: today, lte: weekEnd }, status: { not: 'CANCELLED' } } }),
    prisma.timeOffRequest.count({ where: { status: 'PENDING' } }),
    prisma.shiftTrade.count({ where: { status: 'PENDING' } }),
  ]);

  res.json({ totalEmployees, shiftsThisWeek, pendingTimeOff, pendingTrades });
}
