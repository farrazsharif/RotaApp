// Which of a day's visits "owns" a medication dose scheduled at time t (HH:MM).
//
// A dose's time is a nominal label (GP says "morning" = 08:00) but a visit
// rarely lines up to the minute, and a client may be visited fewer times than
// they have doses. So every dose is assigned to exactly one visit — the visit
// closest in time to when the dose is due:
//   * a visit whose window contains the dose time owns it; otherwise
//   * the visit whose window is nearest (before or after) owns it.
// This keeps a morning dose on the morning call and an evening dose on the
// evening call, and — when a client is visited only once — puts every dose
// (including later ones to prepare/leave out) on that single visit.
//
// Shared by the carer app (who should see/record the dose) and the MAR chart
// (which marks a dose "cancelled" only when no ACTIVE visit will absorb it), so
// both stay in lock-step.
export interface OwnableShift { id: string; startTime: string; endTime: string }

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Is dose time t inside this visit's window? Handles overnight visits that wrap
// past midnight (e.g. 19:00–07:00 → t >= 19:00 OR t <= 07:00).
export const doseInWindow = (s: { startTime: string; endTime: string }, t: string) =>
  s.endTime < s.startTime ? (t >= s.startTime || t <= s.endTime) : (t >= s.startTime && t <= s.endTime);

// Minutes from dose time t to a visit's window (0 if inside), overnight-aware.
function distToWindow(s: OwnableShift, t: string): number {
  if (doseInWindow(s, t)) return 0;
  const tm = toMin(t), sm = toMin(s.startTime), em = toMin(s.endTime);
  if (s.endTime < s.startTime) return Math.min(Math.abs(tm - em), Math.abs(sm - tm)); // hole between em and sm
  return tm < sm ? sm - tm : tm - em;
}

// Returns the id of the visit nearest to dose time t, or null if there are no
// candidate visits. Candidates should already be filtered to visits that
// administer medication; the caller decides whether cancelled ones are included.
// Ties break to the earliest-starting visit (then id) for determinism.
export function ownerShiftIdForDose(candidates: OwnableShift[], t: string): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  let best = sorted[0];
  let bestDist = distToWindow(best, t);
  for (const c of sorted) {
    const d = distToWindow(c, t);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best.id;
}
