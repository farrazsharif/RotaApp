import api from '../lib/axios';

export interface RiskAssessment {
  id: string;
  serviceUserId: string;
  type: string;
  data: string; // JSON string of values
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentSummary {
  serviceUserId: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  onFile?: boolean; // held on paper (scan attached), essentials logged
  completedDate?: string | null;
  reviewDate?: string | null;
}

export const riskAssessmentsApi = {
  list: (serviceUserId?: string) =>
    api.get<RiskAssessmentSummary[]>('/risk-assessments', { params: serviceUserId ? { serviceUserId } : {} }).then((r) => r.data),
  get: (serviceUserId: string, type: string) =>
    api.get<RiskAssessment | null>(`/risk-assessments/${serviceUserId}/${type}`).then((r) => r.data),
  save: (serviceUserId: string, type: string, data: Record<string, unknown>) =>
    api.put<RiskAssessment>(`/risk-assessments/${serviceUserId}/${type}`, { data: JSON.stringify(data) }).then((r) => r.data),
  remove: (serviceUserId: string, type: string) =>
    api.delete(`/risk-assessments/${serviceUserId}/${type}`).then((r) => r.data),
};
