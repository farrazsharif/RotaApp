// When a service plan's next review is actually due.
//
// Twin of backend/src/lib/planReview.ts, which is the source of truth for the
// dashboard counts. Keep the two in step.
//
// A plan can be logged as "held on paper" before anybody fills the form in:
// tick the box, record the date completed and the date it falls due, and the
// dashboard has something to count. That bootstrap lives under __paper.
//
// The trouble was it never stopped being the answer. A plan reviewed properly
// in Caremid — assessed, signed by the client and the assessor — still read
// "review overdue" against the paper date somebody typed when the record was
// first seeded, because nothing in the renew flow moved it. Doing the review
// could not clear the flag.
//
// So the form wins. A plan carrying an assessment date is on a cycle from THAT
// date; the paper date only stands in until one exists.

import { PspSection, keyForItem } from './servicePlanSchema';

/** These plans are reviewed yearly. */
export const REVIEW_YEARS = 1;

const ASSESSMENT_DATE_LABEL = 'assessment date';

/** Which stored key holds the assessment date, for the template in use. */
export function assessmentDateKey(sections: PspSection[]): string | null {
  for (const s of sections) {
    for (let i = 0; i < s.items.length; i += 1) {
      if ((s.items[i].label || '').trim().toLowerCase() === ASSESSMENT_DATE_LABEL) {
        return keyForItem(s.items[i], s.id, i);
      }
    }
  }
  return null;
}

/**
 * The assessment date is free text, so it arrives however somebody typed it.
 * Real examples from the live data: "19-09-2026" and "2026-09-19".
 *
 * Four digits first means ISO; otherwise UK order, day first. Anything else is
 * NOT guessed at — an unparseable date returns null and the paper date stands,
 * because inventing a review date is worse than showing the old one.
 */
export function parsePlanDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(/[-/.]/).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  const [y, m, d] = parts[0].length === 4 ? [n[0], n[1], n[2]] : [n[2], n[1], n[0]];
  if (!y || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  // Rejects 31 February and friends, which Date would otherwise roll forward.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + years);
  return x;
}

/**
 * The date this plan's next review falls due, or null if nothing says.
 * `data` is the plan's parsed answers (including __paper).
 */
export function planReviewDate(data: Record<string, unknown> | null, sections: PspSection[]): Date | null {
  const key = data ? assessmentDateKey(sections) : null;
  const assessed = key && data ? parsePlanDate(data[key]) : null;
  if (assessed) return addYears(assessed, REVIEW_YEARS);
  const paper = data?.__paper as { reviewDate?: string } | undefined;
  if (paper?.reviewDate) {
    const d = new Date(paper.reviewDate);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
