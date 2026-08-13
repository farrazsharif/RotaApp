import api from '../lib/axios';

export interface RiskAssessment {
  id: string;
  serviceUserId: string;
  type: string;
  data: string; // JSON string of values
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentSummary {
  serviceUserId: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export const riskAssessmentsApi = {
  list: (serviceUserId: string) =>
    api.get<RiskAssessmentSummary[]>('/risk-assessments', { params: { serviceUserId } }).then((r) => r.data),
  get: (serviceUserId: string, type: string) =>
    api.get<RiskAssessment | null>(`/risk-assessments/${serviceUserId}/${type}`).then((r) => r.data),
};
