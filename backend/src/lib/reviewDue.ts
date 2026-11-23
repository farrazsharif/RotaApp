// Keeping the cached `reviewDueAt` column in step with the blob it comes from.
//
// Why a column at all: the supervision summary read every client's review date
// out of their assessment and plan JSON. Drawn signatures are stored as base64
// inside those blobs — 14 signature fields on a risk assessment, 4 on a
// service plan — so answering "when is this review due" pulled every signature
// anyone had ever drawn into memory, for every client, on every load. The API
// ran out of memory and Render restarted it.
//
// The date is now a column. ONE helper derives it, used by both the write
// paths and the boot rebuild, so the cache cannot disagree with the blob.

import { assessmentDateKey, parsePlanDate, planReviewDate, REVIEW_YEARS } from './planReview';

/**
 * The __paper review date inside a blob, where there is one.
 *
 * `onFile` is required, exactly as the supervision controller's own parser
 * required it before this column existed. A paper document typed up in Caremid
 * sets onFile FALSE while keeping its review date, and those have never been
 * counted as renewals due — so the gate stays. Caching an ungated date here
 * would have quietly added a pile of new items to the worklist while I was
 * meant to be fixing a memory problem.
 */
export function paperReviewDate(raw: string | null | undefined, nested: boolean): Date | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const p = nested ? o.__paper : o;
    if (p && typeof p === 'object' && p.onFile && p.reviewDate) {
      const d = new Date(p.reviewDate);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* a blob that will not parse has no date in it */ }
  return null;
}

/** A risk assessment (and the one-page profile and support plan, same table). */
export function riskAssessmentReviewDue(data: string | null | undefined): Date | null {
  return paperReviewDate(data, true);
}

/** Likes & Dislikes keeps its paper metadata in its own column, unnested. */
export function likesDislikesReviewDue(paperMeta: string | null | undefined): Date | null {
  return paperReviewDate(paperMeta, false);
}

/**
 * A service plan is on a cycle from the assessment date recorded on the form,
 * falling back to the seeded paper date — see planReview.ts for why.
 */
export function servicePlanReviewDue(data: string | null | undefined, templateSections: string | null): Date | null {
  let parsed: Record<string, unknown> | null = null;
  try { parsed = data ? (JSON.parse(data) as Record<string, unknown>) : null; } catch { parsed = null; }
  return planReviewDate(parsed, assessmentDateKey(templateSections), paperReviewDate(data, true));
}

const BATCH = 25;

/**
 * Rebuild every cached date from its blob.
 *
 * Runs at boot, unconditionally, in small batches. Unconditional because NULL
 * is a legitimate value — plenty of records have no review date — so there is
 * no "not yet done" state to test for, and a marker column to invent one would
 * be a worse thing to maintain than a second of work at startup. Batched so
 * the rebuild itself never holds more than a handful of blobs at a time, which
 * is the whole point of the exercise.
 *
 * Idempotent: it recomputes from the blob, which is the source of truth, with
 * the same helpers the write paths use.
 */
export async function rebuildReviewDueAt(prisma: any): Promise<void> {
  const template = await prisma.servicePlanTemplate.findFirst({ select: { sections: true } });
  const sections: string | null = template?.sections ?? null;

  const jobs: { table: string; derive: (row: any) => Date | null; field: 'data' | 'paperMeta' }[] = [
    { table: 'riskAssessment', field: 'data', derive: (r) => riskAssessmentReviewDue(r.data) },
    { table: 'personalServicePlan', field: 'data', derive: (r) => servicePlanReviewDue(r.data, sections) },
    { table: 'likesDislikes', field: 'paperMeta', derive: (r) => likesDislikesReviewDue(r.paperMeta) },
  ];

  for (const job of jobs) {
    let skip = 0;
    for (;;) {
      const rows = await prisma[job.table].findMany({
        select: { id: true, reviewDueAt: true, [job.field]: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        skip,
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const due = job.derive(row);
        const current = row.reviewDueAt ? new Date(row.reviewDueAt).getTime() : null;
        if (current === (due ? due.getTime() : null)) continue; // already right
        await prisma[job.table].update({ where: { id: row.id }, data: { reviewDueAt: due } });
      }
      if (rows.length < BATCH) break;
      skip += BATCH;
    }
  }
}
