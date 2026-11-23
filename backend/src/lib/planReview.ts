// When a service plan's next review is actually due.
//
// A plan can be logged as "held on paper" before anybody fills the form in:
// tick the box, record the date it was completed and the date it falls due,
// and the dashboard has something to count. That bootstrap lives under the
// reserved __paper key.
//
// The trouble was that it NEVER STOPPED BEING THE ANSWER. Atif Mahmood's
// Personal Service Plan was reviewed in Caremid on 19 September 2026, signed
// by the client and the assessor — and still read "review overdue 02 Apr
// 2026", because that was the paper date somebody typed when the record was
// first seeded and nothing in the renew flow ever moved it. Doing the review
// properly, in the software, could not clear the flag.
//
// So the form wins. A plan carrying an assessment date is on a cycle from THAT
// date; the paper date is only what stands in until one exists. Derived on
// read, so every record already in this state corrects itself.
//
// Twin of frontend/src/lib/planReview.ts — keep the two in step.

/** These plans are reviewed yearly. */
export const REVIEW_YEARS = 1;

// The field holding the date the assessment was carried out. Companies can
// edit the template, so it is found by LABEL against whatever template is in
// use, with the built-in default's key as the fallback.
const ASSESSMENT_DATE_LABEL = 'assessment date';
const DEFAULT_ASSESSMENT_KEY = 'consent.4';

type TemplateItem = { id?: string; label?: string };
type TemplateSection = { id?: string; items?: TemplateItem[] };

/**
 * Which stored key holds the assessment date, for the template in use.
 *
 * Mirrors keyForItem() in the frontend schema: an item's own id when it has
 * one, else its positional `section.index` key, which is what older saved
 * plans are keyed by.
 */
export function assessmentDateKey(sectionsJson: string | null | undefined): string {
  if (!sectionsJson) return DEFAULT_ASSESSMENT_KEY;
  try {
    const sections = JSON.parse(sectionsJson) as TemplateSection[];
    if (!Array.isArray(sections)) return DEFAULT_ASSESSMENT_KEY;
    for (const s of sections) {
      const items = Array.isArray(s.items) ? s.items : [];
      for (let i = 0; i < items.length; i += 1) {
        if ((items[i].label || '').trim().toLowerCase() === ASSESSMENT_DATE_LABEL) {
          return items[i].id ?? `${s.id}.${i}`;
        }
      }
    }
  } catch { /* fall through to the default */ }
  return DEFAULT_ASSESSMENT_KEY;
}

/**
 * The assessment date is free text, so it arrives however somebody typed it.
 * Real examples from the live data: "19-09-2026" and "2026-09-19".
 *
 * Four digits first means ISO. Otherwise UK order, day first — which is what
 * the form asks for and what the paper version has always said. Anything else
 * is NOT guessed at: an unparseable date returns null and the paper date
 * stands, because inventing a review date is worse than showing the old one.
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
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February and friends, which Date would otherwise roll forward.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + years);
  return x;
}

/**
 * The date this plan's next review falls due, or null if nothing says.
 *
 * `data` is the plan's parsed answers, `paperReview` the __paper date.
 */
export function planReviewDate(
  data: Record<string, unknown> | null,
  key: string,
  paperReview: Date | null,
): Date | null {
  const assessed = data ? parsePlanDate(data[key]) : null;
  if (assessed) return addYears(assessed, REVIEW_YEARS);
  return paperReview;
}
