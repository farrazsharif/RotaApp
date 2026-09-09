import api from '../lib/axios';

// Light metadata for the "Previous reviews" list.
export interface RiskAssessmentVersionSummary {
  id: string;
  type: string;
  label: string | null;
  reviewDate: string | null;
  createdByName: string;
  createdAt: string;
}

// Full frozen snapshot of the assessment for viewing/printing read-only.
export interface RiskAssessmentVersionFull extends RiskAssessmentVersionSummary {
  serviceUserId: string;
  data: Record<string, unknown>;
}

export const riskAssessmentVersionsApi = {
  list: (serviceUserId: string, type: string) =>
    api.get<RiskAssessmentVersionSummary[]>('/risk-assessment-versions', { params: { serviceUserId, type } }).then((r) => r.data),
  get: (id: string) => api.get<RiskAssessmentVersionFull>(`/risk-assessment-versions/${id}`).then((r) => r.data),
  // The snapshot is built server-side from the stored assessment; the client
  // only supplies the client id, the assessment type and an optional label.
  create: (body: { serviceUserId: string; type: string; label?: string }) =>
    api.post<RiskAssessmentVersionSummary>('/risk-assessment-versions', body).then((r) => r.data),
};
