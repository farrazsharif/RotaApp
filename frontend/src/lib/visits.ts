// Canonical visit-name options, shared by the Add Shift modal and the
// service-user visit planner so both always offer the same choices.
export const VISIT_PRESETS = ['Morning Call', 'Lunch Call', 'Tea Call', 'Bed Call', 'Night Call', 'Shopping Call', 'Cleaning Call', 'Laundry Call', 'Domestic Call', 'Social Call', 'Sitting Call', 'Pop In Call'];

// A service user's configured weekly visit (the rota template). days are weekday
// indices 0=Mon … 6=Sun; omitted/empty/all-seven = every day. cover = carers on
// the call (omitted = 1).
export interface VisitRow { type: string; duration: number; days?: number[]; cover?: number }

export function parseVisits(json?: string | null): VisitRow[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v) => v && typeof v === 'object' && v.type)
      .map((v) => ({
        type: String(v.type),
        duration: Number(v.duration) || 0,
        days: Array.isArray(v.days) ? v.days.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6) : undefined,
        cover: Number(v.cover) >= 2 ? Math.min(3, Math.floor(Number(v.cover))) : undefined,
      }));
  } catch { return []; }
}

export const visitDaysCount = (v: VisitRow): number => (!v.days || v.days.length === 0 || v.days.length === 7 ? 7 : v.days.length);
export const visitCover = (v: VisitRow): number => (v.cover && v.cover >= 1 ? v.cover : 1);
export const visitIsEveryDay = (v: VisitRow): boolean => !v.days || v.days.length === 0 || v.days.length === 7;

// Total weekly minutes (duration × days-per-week × carers) and visit count
// (one per day the visit runs) across every visit — all call types included.
export function visitStats(visits: VisitRow[]): { mins: number; count: number } {
  let mins = 0, count = 0;
  for (const v of visits) {
    const d = visitDaysCount(v);
    count += d;
    mins += (Number(v.duration) || 0) * d * visitCover(v);
  }
  return { mins, count };
}
