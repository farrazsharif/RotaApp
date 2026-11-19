// The Employment Gap History Form (recruitment / vetting, Reg 19 Sch 3).
//
// The paper form asks for the jobs in one table and then asks the applicant to
// list the gaps between them in another. That is the same information twice,
// and the second table is the one that gets fudged: a gap somebody forgot to
// write down is a gap nobody ever asks about.
//
// So here the gaps are WORKED OUT from the jobs. Enter the employment, and
// every uncovered month shows up by itself needing an explanation. It cannot
// be skipped, because nobody is typing the list.
//
// Months, not days. The paper form asks for MM/YY and a vetting trail does not
// turn on which Tuesday somebody left.

export interface EmploymentEntry {
  employer: string;
  jobTitle: string;
  /** YYYY-MM */
  from: string;
  /** YYYY-MM. Blank means still there. */
  to: string;
  reason: string;
}

export interface GapExplanation {
  reason: string;
  activity: string;
}

export interface EmploymentHistory {
  /** The month full-time education ended: where the timeline starts. */
  educationEndedAt?: string;
  entries: EmploymentEntry[];
  /** Keyed "YYYY-MM:YYYY-MM" so an explanation stays with its own gap. */
  gaps: Record<string, GapExplanation>;
  signature?: string;
  signedName?: string;
  signedDate?: string;
  /** Office use. */
  receivedBy?: string;
  receivedAt?: string;
  notes?: string;
  updatedAt?: string;
}

export interface DerivedGap {
  key: string;
  from: string;
  to: string;
  months: number;
}

export const emptyEmploymentHistory = (): EmploymentHistory => ({ entries: [], gaps: {} });

const MONTH = /^\d{4}-\d{2}$/;

/** "2024-03" -> 24291. Months since year zero, so arithmetic is just numbers. */
function toIndex(m: string): number | null {
  if (!MONTH.test(m)) return null;
  const [y, mo] = m.split('-').map(Number);
  if (mo < 1 || mo > 12) return null;
  return y * 12 + (mo - 1);
}

function fromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const mo = (i % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(m: string): string {
  const i = toIndex(m);
  if (i === null) return m;
  const d = new Date(Date.UTC(Math.floor(i / 12), i % 12, 1));
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The months not covered by any job, between leaving education and today.
 *
 * Overlapping jobs are merged first: somebody holding two posts at once has no
 * gap between them, and treating each job separately would invent one.
 */
export function findGaps(history: EmploymentHistory, now = thisMonth()): DerivedGap[] {
  const end = toIndex(now);
  if (end === null) return [];

  const spans: [number, number][] = [];
  for (const e of history.entries) {
    const from = toIndex(e.from);
    if (from === null) continue; // not filled in yet; nothing to measure
    // Blank "to" means still employed, which closes the timeline at today.
    const to = e.to ? toIndex(e.to) : end;
    if (to === null || to < from) continue; // half-typed or back to front
    spans.push([from, Math.min(to, end)]);
  }
  if (spans.length === 0) return [];

  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [spans[0]];
  for (const [from, to] of spans.slice(1)) {
    const last = merged[merged.length - 1];
    // Touching counts as continuous: leaving in March and starting in April is
    // not a gap, it is a Monday.
    if (from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }

  const gaps: Omit<DerivedGap, 'key'>[] = [];
  const start = history.educationEndedAt ? toIndex(history.educationEndedAt) : null;

  // Before the first job, if we know when the timeline starts.
  if (start !== null && merged[0][0] > start + 1) {
    gaps.push({ from: fromIndex(start + 1), to: fromIndex(merged[0][0] - 1), months: merged[0][0] - start - 1 });
  }
  for (let i = 1; i < merged.length; i += 1) {
    const from = merged[i - 1][1] + 1;
    const to = merged[i][0] - 1;
    if (to >= from) gaps.push({ from: fromIndex(from), to: fromIndex(to), months: to - from + 1 });
  }
  // And since the last job ended.
  const last = merged[merged.length - 1][1];
  if (last < end) gaps.push({ from: fromIndex(last + 1), to: fromIndex(end), months: end - last });

  return gaps.map((g) => ({ ...g, key: `${g.from}:${g.to}` }));
}

/** A gap with nothing written against it is the point of the whole form. */
export function unexplainedGaps(history: EmploymentHistory, now = thisMonth()): DerivedGap[] {
  return findGaps(history, now).filter((g) => {
    const said = history.gaps?.[g.key];
    return !said || !said.reason.trim();
  });
}
