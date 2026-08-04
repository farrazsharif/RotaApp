// Which of a day's visits "owns" a medication dose scheduled at time t (HH:MM).
//
// A dose's time is a nominal label (GP says "morning" = 08:00) but a visit
// rarely lines up to the minute, and a client may be visited fewer times than
// they have doses. So every dose is assigned to exactly one visit — the visit
// that will handle it — using this rule:
//   1. a visit whose window contains the dose time gives it live; else
//   2. the nearest upcoming visit within grace gives it (slightly early/late); else
//   3. the last visit BEFORE the dose prepares it (leave-out for later); else
//   4. the first visit of the day gives it (a dose earlier than any visit).
//
// Shared by the carer app (who should see/record the dose) and the MAR chart
// (which marks a dose "cancelled" only when no ACTIVE visit will absorb it), so
// both stay in lock-step.
export const DOSE_VISIT_GRACE_MIN = 180; // how soon an upcoming visit "catches" a stray dose

export interface OwnableShift { id: string; startTime: string; endTime: string }

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Is dose time t inside this visit's window? Handles overnight visits that wrap
// past midnight (e.g. 19:00–07:00 → t >= 19:00 OR t <= 07:00).
export const doseInWindow = (s: { startTime: string; endTime: string }, t: string) =>
  s.endTime < s.startTime ? (t >= s.startTime || t <= s.endTime) : (t >= s.startTime && t <= s.endTime);

// Returns the id of the visit that owns dose time t, or null if there are no
// candidate visits. Candidates should already be filtered to visits that
// administer medication; the caller decides whether cancelled ones are included.
export function ownerShiftIdForDose(candidates: OwnableShift[], t: string, graceMin = DOSE_VISIT_GRACE_MIN): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  const contains = sorted.find((c) => doseInWindow(c, t));
  if (contains) return contains.id;
  const tm = toMin(t);
  const upcoming = sorted.filter((c) => toMin(c.startTime) > tm).sort((a, b) => toMin(a.startTime) - toMin(b.startTime))[0];
  if (upcoming && toMin(upcoming.startTime) - tm <= graceMin) return upcoming.id;
  const before = sorted.filter((c) => toMin(c.startTime) <= tm);
  if (before.length > 0) return before[before.length - 1].id;
  return sorted[0].id;
}
