import api from '../lib/axios';

export type CheckStatus = 'red' | 'amber' | 'green' | 'info';
export interface CheckItem { id: string; label: string; link?: string }
export interface CqcCheck {
  id: string;
  title: string;
  statement: string;
  status: CheckStatus;
  count: number;
  total: number;
  detail: string;
  items: CheckItem[];
}
export interface KeyQuestionBlock { key: string; label: string; score: number; checks: CqcCheck[] }
export interface CqcReadiness {
  generatedAt: string;
  overallScore: number;
  keyQuestions: KeyQuestionBlock[];
  selfAssessment: Record<string, { rating?: string; note?: string }>;
}

export type StatementStatus = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'INSUFFICIENT_EVIDENCE';

export interface StatementEvidence {
  checkId: string;
  title: string;
  status: CheckStatus;
  detail: string;
  met: number;
  total: number;
  items: CheckItem[];
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
  systemStatus: StatementStatus;
  systemStatusLabel: string;
  reason: string;
  checkedAt: string;
  evidence: StatementEvidence[];
  needsReview: boolean;
  lookFor?: string;
  review: StatementReviewRecord | null;
  history: StatementReviewRecord[];
  divergent: boolean;
}
export interface StatementsResponse {
  generatedAt: string;
  overallScore: number;
  keyQuestions: { key: string; label: string; score: number }[];
  statements: AssessedStatement[];
  methodology: {
    totalStatements: number;
    evidencedByData: number;
    awaitingReview: number;
    reviewedByManager: number;
    divergent: number;
    notes: string[];
  };
  evidenceVisible: boolean;
}

export const cqcApi = {
  readiness: () => api.get<CqcReadiness>('/cqc/readiness').then((r) => r.data),
  statements: () => api.get<StatementsResponse>('/cqc/statements').then((r) => r.data),
  reviewStatement: (key: string, body: { status: string; rationale: string; evidence?: string }) =>
    api.post(`/cqc/statements/${key}/review`, body).then((r) => r.data),
};
