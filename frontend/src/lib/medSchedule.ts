// Shared medication-schedule helpers — one source of truth so the eMAR day
// view, the MAR chart and the server all agree on which days a med is due.
// Everything is computed at UTC midnight, matching how doses are recorded.
import type { Medication } from '../types';

// Weekday numbers are JS getDay() values (0=Sun). Labels shown Mon-first.
const WEEKDAYS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];

export function parseDays(s?: string | null): number[] {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : []; } catch { return []; }
}

export function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length >= WEEKDAYS.length) return 'Every day';
  return WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.label).join(', ');
}

type SchedFields = Pick<Medication, 'daysOfWeek' | 'intervalDays' | 'startDate' | 'createdAt'>;

const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// Is this med due on the given target date? The target is taken by its UTC day.
export function isMedDueOn(med: SchedFields, date: Date): boolean {
  const interval = Number(med.intervalDays) || 0;
  const target = utcMidnight(date);
  if (interval >= 2) {
    const src = med.startDate ? new Date(med.startDate) : (med.createdAt ? new Date(med.createdAt) : null);
    if (!src || isNaN(src.getTime())) return false;
    const anchor = utcMidnight(src);
    const diffDays = Math.round((target - anchor) / 86400000);
    return diffDays >= 0 && diffDays % interval === 0;
  }
  const days = parseDays(med.daysOfWeek);
  if (days.length === 0) return true;
  return days.includes(new Date(target).getUTCDay());
}

// Human-readable schedule, e.g. "Every 2 days (alternate days)", "Every 3 days",
// "Mon, Thu" or "Every day".
export function scheduleLabel(med: Pick<Medication, 'daysOfWeek' | 'intervalDays'>): string {
  const interval = Number(med.intervalDays) || 0;
  if (interval >= 2) return interval === 2 ? 'Every 2 days (alternate days)' : `Every ${interval} days`;
  return daysLabel(parseDays(med.daysOfWeek));
}
