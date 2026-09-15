import { prisma } from './prisma';
import { emitToUser } from './socket';
import { sendPushToUser } from './push';

// Shift start/end times are UK wall-clock ("15:05" = 3:05pm UK, as entered by
// the manager) — NOT UTC. The server runs in UTC, so building a Date from those
// numbers with the local constructor silently treats them as UTC, which is an
// hour off while the UK is on BST. The away-window boundaries (admission/return)
// ARE real UTC instants (the datetime-local input is converted through the
// browser's timezone), so a visit within an hour of the return time slipped past
// the boundary and escaped cancellation. Convert the UK wall-clock components to
// the correct UTC instant so both sides of the comparison are the same kind of
// value. DST is handled automatically via Intl.
function ukWallClockToUtc(y: number, mon: number, day: number, h: number, min: number): Date {
  const guess = Date.UTC(y, mon, day, h, min, 0);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const offset = asUtc - guess; // ms the UK clock is ahead of UTC (0 or +1h)
  return new Date(guess - offset);
}

// Combine a shift's stored date (noon-anchored) with its "HH:MM" start time so
// away-window boundaries respect the time of day — as a proper UK-local instant.
function shiftStart(date: Date, startTime: string): Date {
  const d = new Date(date);
  const [h, m] = String(startTime || '00:00').split(':').map(Number);
  return ukWallClockToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 0, m || 0);
}

type ShiftLite = { id: string; date: Date; startTime: string; userId: string | null; coverCarers: { id: string }[] };

const shiftSelect = { id: true, date: true, startTime: true, userId: true, coverCarers: { select: { id: true } } };

// One grouped bell + push notification per affected carer.
async function notifyCarers(shifts: ShiftLite[], type: string, title: string, message: (count: number) => string) {
  const perCarer = new Map<string, number>();
  for (const s of shifts) {
    for (const cid of [s.userId, ...s.coverCarers.map((c) => c.id)].filter(Boolean) as string[]) {
      perCarer.set(cid, (perCarer.get(cid) ?? 0) + 1);
    }
  }
  await Promise.all(
    [...perCarer.entries()].map(async ([cid, count]) => {
      const body = message(count);
      const n = await prisma.notification.create({ data: { userId: cid, type, title, message: body, data: '{}' } });
      emitToUser(cid, 'notification', n);
      await sendPushToUser(cid, { title, body });
    }),
  );
}

// Cancel a client's SCHEDULED visits whose start falls in [startAt, endAt), as
// non-chargeable. Returns the cancelled shift ids. Notifies carers when asked.
export async function cancelAwayWindow(
  serviceUserId: string, startAt: Date, endAt: Date,
  opts: { reason: string; patientName: string; awayLabel: string; notify: boolean },
): Promise<string[]> {
  const dayBefore = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate() - 1, 0, 0, 0);
  const dayAfter = new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate() + 1, 23, 59, 59);
  const candidates = await prisma.shift.findMany({
    where: { serviceUserId, status: 'SCHEDULED', date: { gte: dayBefore, lte: dayAfter } },
    select: shiftSelect,
  });
  const inWindow = candidates.filter((s) => {
    const st = shiftStart(s.date, s.startTime);
    return st >= startAt && st < endAt;
  });
  if (inWindow.length === 0) return [];
  await prisma.shift.updateMany({
    where: { id: { in: inWindow.map((s) => s.id) } },
    data: {
      status: 'CANCELLED', cancelledAt: new Date(), cancelBillable: false,
      cancelChargeType: null, cancelChargePercent: null, cancelChargeAmount: null, cancelReason: opts.reason,
    },
  });
  if (opts.notify) {
    await notifyCarers(
      inWindow, 'SHIFT_CANCELLED', 'Visits Cancelled',
      (n) => `${n} upcoming visit${n > 1 ? 's' : ''} for ${opts.patientName} ${n > 1 ? 'have' : 'has'} been cancelled — ${opts.awayLabel}.`,
    );
  }
  return inWindow.map((s) => s.id);
}

// Un-cancel visits (by id) whose start is at/after `fromAt` — used when a return
// date is brought forward or the patient is discharged. Only touches visits
// still CANCELLED. Returns the restored ids. Notifies carers when asked.
export async function restoreAwayVisits(
  shiftIds: string[], fromAt: Date,
  opts: { patientName: string; resumeLabel: string; notify: boolean },
): Promise<string[]> {
  if (shiftIds.length === 0) return [];
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, status: 'CANCELLED' },
    select: shiftSelect,
  });
  const toRestore = shifts.filter((s) => shiftStart(s.date, s.startTime) >= fromAt);
  if (toRestore.length === 0) return [];
  await prisma.shift.updateMany({
    where: { id: { in: toRestore.map((s) => s.id) } },
    data: {
      status: 'SCHEDULED', cancelledAt: null, cancelBillable: false,
      cancelChargeType: null, cancelChargePercent: null, cancelChargeAmount: null, cancelReason: null,
    },
  });
  if (opts.notify) {
    await notifyCarers(
      toRestore, 'SHIFT_RESTORED', 'Visits Resumed',
      (n) => `${n} visit${n > 1 ? 's' : ''} for ${opts.patientName} ${n > 1 ? 'have' : 'has'} resumed — ${opts.resumeLabel}.`,
    );
  }
  return toRestore.map((s) => s.id);
}
