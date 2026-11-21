import { prisma } from './prisma';
import {
  QUALITY_STATEMENTS,
  STATUS_LABEL,
  StatementStatus,
} from './qualityStatements';

/**
 * One assessment engine for the readiness dashboard, the quality statements
 * and the management-review screen.
 *
 * It does not run any checks of its own. It takes the result of
 * computeReadiness() - the same object the dashboard renders - and groups it
 * by quality statement, so the three views cannot disagree: there is one set
 * of numbers and three ways of looking at it.
 *
 * Two rules worth stating plainly, because both are easy to get wrong and
 * expensive when you do:
 *
 * A missing record is not evidence that care was not given. Where a statement
 * has no automated checks behind it the status is INSUFFICIENT_EVIDENCE, which
 * asks a person to look. It is not counted as a failure and does not move the
 * score.
 *
 * A manager's judgement never clears a finding. Their decision is recorded
 * alongside the system's, both are shown, and the failing records stay in the
 * action list whatever the manager selected. Marking a statement Met while
 * three clients have no risk assessment leaves three clients with no risk
 * assessment.
 */

export interface StatementEvidence {
  checkId: string;
  title: string;
  status: string;      // green | amber | red
  detail: string;
  met: number;
  total: number;
  /** The records that failed this check, named. */
  items: { id: string; label: string; link?: string }[];
}

export interface StatementReviewRecord {
  status: string;
  rationale: string;
  evidence: string | null;
  systemStatusAtReview: string | null;
  reviewedAt: string;
  reviewedBy: string;
}

export interface AssessedStatement {
  key: string;
  label: string;
  keyQuestion: string;
  /** What the data says. */
  systemStatus: StatementStatus;
  systemStatusLabel: string;
  /** Why it says it, in one line. */
  reason: string;
  /** When the evidence was gathered. */
  checkedAt: string;
  evidence: StatementEvidence[];
  /** Empty when nothing automated bears on this statement. */
  needsReview: boolean;
  lookFor?: string;
  /** The manager's current position, if one has been recorded. */
  review: StatementReviewRecord | null;
  /** Every review ever recorded, newest first. */
  history: StatementReviewRecord[];
  /** True where the manager's view and the data disagree - shown, not resolved. */
  divergent: boolean;
}

type Readiness = {
  generatedAt: string;
  keyQuestions: { key: string; label: string; score: number; checks: {
    id: string; title: string; status: string; count: number; total: number; detail: string;
    items: { id: string; label: string; link?: string }[];
  }[] }[];
};

function statusFrom(evidence: StatementEvidence[]): StatementStatus {
  if (!evidence.length) return 'INSUFFICIENT_EVIDENCE';
  if (evidence.some((e) => e.status === 'red')) return 'NOT_MET';
  if (evidence.some((e) => e.status === 'amber')) return 'PARTIALLY_MET';
  return 'MET';
}

function reasonFrom(evidence: StatementEvidence[], status: StatementStatus): string {
  if (status === 'INSUFFICIENT_EVIDENCE') {
    return 'Caremid holds no record that can settle this statement. It needs a person to assess it.';
  }
  const failing = evidence.filter((e) => e.status !== 'green');
  if (!failing.length) {
    return `All ${evidence.length} check${evidence.length === 1 ? '' : 's'} behind this statement pass.`;
  }
  return failing.map((f) => f.detail).join(' ');
}

const asRecord = (r: {
  status: string; rationale: string; evidence: string | null; systemStatusAtReview: string | null;
  reviewedAt: Date; reviewedBy: { firstName: string; lastName: string } | null;
}): StatementReviewRecord => ({
  status: r.status,
  rationale: r.rationale,
  evidence: r.evidence,
  systemStatusAtReview: r.systemStatusAtReview,
  reviewedAt: r.reviewedAt.toISOString(),
  reviewedBy: r.reviewedBy ? `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`.trim() : 'Unknown',
});

/**
 * Assemble every quality statement from a readiness result.
 *
 * `includeEvidence` is false for anyone without permission to see named
 * client and staff records: they still get the status and the counts, which
 * is the part that is theirs to know.
 */
export async function assessStatements(
  readiness: Readiness,
  includeEvidence = true,
): Promise<AssessedStatement[]> {
  const byId = new Map(readiness.keyQuestions.flatMap((k) => k.checks).map((c) => [c.id, c]));

  const reviews = await prisma.statementReview.findMany({
    orderBy: { reviewedAt: 'desc' },
    include: { reviewedBy: { select: { firstName: true, lastName: true } } },
  });
  const byStatement = new Map<string, typeof reviews>();
  for (const r of reviews) byStatement.set(r.statementKey, [...(byStatement.get(r.statementKey) ?? []), r]);

  return QUALITY_STATEMENTS.map((s) => {
    const evidence: StatementEvidence[] = s.checks
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({
        checkId: c.id,
        title: c.title,
        status: c.status,
        detail: c.detail,
        met: Math.max(0, c.total - c.count),
        total: c.total,
        items: includeEvidence ? c.items : [],
      }));

    const systemStatus = statusFrom(evidence);
    const history = (byStatement.get(s.key) ?? []).map(asRecord);
    const review = history[0] ?? null;

    return {
      key: s.key,
      label: s.label,
      keyQuestion: s.keyQuestion,
      systemStatus,
      systemStatusLabel: STATUS_LABEL[systemStatus],
      reason: reasonFrom(evidence, systemStatus),
      checkedAt: readiness.generatedAt,
      evidence,
      needsReview: systemStatus === 'INSUFFICIENT_EVIDENCE',
      lookFor: s.lookFor,
      review,
      history,
      // A manager saying Met over a red finding is a disagreement to surface,
      // not a resolution to apply.
      divergent: !!review && review.status !== systemStatus && systemStatus !== 'INSUFFICIENT_EVIDENCE',
    };
  });
}

/**
 * How the percentages are worked out, in the words shown on the page.
 *
 * Deliberately plain, and deliberately not a rating. CQC rates a service;
 * this counts records.
 */
export function methodology(statements: AssessedStatement[]) {
  const assessed = statements.filter((s) => s.systemStatus !== 'INSUFFICIENT_EVIDENCE');
  const awaiting = statements.filter((s) => s.systemStatus === 'INSUFFICIENT_EVIDENCE');
  const reviewed = awaiting.filter((s) => !!s.review);

  return {
    totalStatements: statements.length,
    evidencedByData: assessed.length,
    awaitingReview: awaiting.length - reviewed.length,
    reviewedByManager: reviewed.length,
    divergent: statements.filter((s) => s.divergent).length,
    notes: [
      'The percentage is the share of automated checks passing, per key question, averaged across the five. Every check counts the same: none is weighted above another.',
      'A check scores on the population it can measure. Clients who are discharged or deceased are excluded; clients in hospital or on hold are excluded from service-review timing only.',
      'Statements with no automated check behind them are NOT in the percentage. Counting them as failures would mark the service down for records Caremid was never built to hold.',
      'A manager’s assessment is recorded and shown but does not change the percentage. Otherwise the score would measure opinion rather than records.',
      'This is a readiness indicator built from your own data. It is not a CQC rating and carries no regulatory status.',
    ],
  };
}
