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

export const cqcApi = {
  readiness: () => api.get<CqcReadiness>('/cqc/readiness').then((r) => r.data),
  saveSelfAssessment: (selfAssessment: Record<string, { rating?: string; note?: string }>) =>
    api.put('/cqc/self-assessment', { selfAssessment }).then((r) => r.data),
};
