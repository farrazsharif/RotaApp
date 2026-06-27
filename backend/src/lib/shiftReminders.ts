import { prisma } from './prisma';
import { sendPushToUser, pushConfigured } from './push';

// Shift.startTime/endTime are literal UK wall-clock times (e.g. "14:00"
// means 2pm UK time, as entered by the manager) — they are NOT UTC. The
// server runs in UTC, so building a Date from those numbers with the local
// Date constructor silently treats them as UTC instead, which is off by
// an hour for as long as the UK is on BST. Comparing against the current
// UK wall-clock time (via Intl, which accounts for BST automatically)
// avoids that entirely — everything stays in plain "minutes since
// midnight, UK time" integer arithmetic, no Date-timezone ambiguity.
function ukNowParts(): { year: number; month: number; day: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const hour = get('hour') % 24; // Intl can format midnight as "24" with hour12: false
  return { year: get('year'), month: get('month'), day: get('day'), minutesOfDay: hour * 60 + get('minute') };
}

function minutesUntil(time: string, nowMinutesOfDay: number): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m - nowMinutesOfDay;
}

async function notifyIfDue(shiftId: string, carerId: string, type: 'BEFORE' | 'START', payload: { title: string; body: string; url?: string }) {
  try {
    await prisma.shiftReminder.create({ data: { shiftId, userId: carerId, type } });
  } catch {
    return; // unique constraint hit — already sent
  }
  await sendPushToUser(carerId, payload);
}

export async function checkShiftReminders() {
  if (!pushConfigured) return;
  const uk = ukNowParts();
  // shift.date comes from a date-only "YYYY-MM-DD" string, which JS always
  // parses as UTC midnight regardless of server timezone — so its UTC
  // year/month/day is reliably the calendar day the manager picked, and
  // lines up directly with today's UK calendar day here.
  const dayStart = new Date(Date.UTC(uk.year, uk.month - 1, uk.day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(uk.year, uk.month - 1, uk.day, 23, 59, 59));

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' }, published: true },
    include: { coverCarers: { select: { id: true } }, clockRecords: { select: { userId: true, clockOut: true } } },
  });

  for (const shift of shifts) {
    const carerIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    if (carerIds.length === 0) continue;

    const minsToStart = minutesUntil(shift.startTime, uk.minutesOfDay);
    const dueBefore = minsToStart === 30;
    const dueStart = minsToStart === 0;
    if (!dueBefore && !dueStart) continue;

    for (const carerId of carerIds) {
      // Skip carers already clocked in to this shift — they don't need a reminder to clock in.
      const hasOpenClockIn = shift.clockRecords.some((r) => r.userId === carerId && r.clockOut === null);
      if (hasOpenClockIn) continue;

      if (dueBefore) {
        await notifyIfDue(shift.id, carerId, 'BEFORE', {
          title: 'Upcoming call in 30 minutes',
          body: `${shift.visitName || 'Your call'} starts at ${shift.startTime}`,
          url: `/call/${shift.id}`,
        });
      }
      if (dueStart) {
        await notifyIfDue(shift.id, carerId, 'START', {
          title: 'Call starting now',
          body: `${shift.visitName || 'Your call'} is starting — tap to clock in`,
          url: `/call/${shift.id}`,
        });
      }
    }
  }
}

export function startShiftReminders() {
  if (!pushConfigured) {
    console.log('Push notifications not configured (missing VAPID keys) — shift reminders disabled.');
    return;
  }
  setInterval(() => {
    checkShiftReminders().catch((err) => console.error('Shift reminder check failed:', err));
  }, 60_000);
}
