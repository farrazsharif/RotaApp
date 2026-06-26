import { prisma } from './prisma';
import { sendPushToUser, pushConfigured } from './push';

// Polled every minute (see startShiftReminders). "now" is floored to the
// whole minute before comparing, so each calendar minute is checked for an
// exact match exactly once per poll cycle — a +/- second tolerance window
// would instead depend on the poll's arbitrary phase offset and could miss
// the target minute every single cycle for a given server run.
function minutesUntil(date: Date, time: string, fromFloored: Date): number {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0);
  return Math.round((target.getTime() - fromFloored.getTime()) / 60_000);
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
  const now = new Date();
  const nowFloored = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: dayStart, lte: dayEnd }, status: { not: 'CANCELLED' }, published: true },
    include: { coverCarers: { select: { id: true } }, clockRecords: { select: { userId: true, clockOut: true } } },
  });

  for (const shift of shifts) {
    const carerIds = [shift.userId, ...shift.coverCarers.map((c) => c.id)].filter(Boolean) as string[];
    if (carerIds.length === 0) continue;

    const minsToStart = minutesUntil(shift.date, shift.startTime, nowFloored);
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
