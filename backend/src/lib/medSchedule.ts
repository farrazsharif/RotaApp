// Shared "is this med due on date X?" — used by the carer visit-meds endpoint
// and the cancelled-dose computation so every surface agrees. Everything is
// computed at UTC midnight, matching how dose slots are recorded and matched.

export interface MedScheduleFields {
  daysOfWeek?: string | null;
  intervalDays?: number | null;
  startDate?: Date | string | null;
  createdAt?: Date | string | null;
}

// Clamp an incoming interval to 0 (weekday mode) or 2..365.
export function clampIntervalDays(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 2) return 0;
  return Math.min(365, n);
}

const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// `date` is interpreted by its UTC calendar day.
export function isMedDueOn(med: MedScheduleFields, date: Date): boolean {
  const interval = Number(med.intervalDays) || 0;
  const target = utcMidnight(date);
  if (interval >= 2) {
    const src = med.startDate ? new Date(med.startDate) : (med.createdAt ? new Date(med.createdAt) : null);
    if (!src || isNaN(src.getTime())) return false;
    const anchor = utcMidnight(src);
    const diffDays = Math.round((target - anchor) / 86400000);
    return diffDays >= 0 && diffDays % interval === 0;
  }
  let days: number[] = [];
  try { days = JSON.parse(String(med.daysOfWeek ?? '[]')); } catch { days = []; }
  if (!Array.isArray(days) || days.length === 0) return true;
  return days.includes(new Date(target).getUTCDay());
}
