import api from '../lib/axios';
import { PspTemplate } from '../lib/servicePlanSchema';

// Light metadata for the history list.
export interface ServicePlanVersionSummary {
  id: string;
  label: string | null;
  signedByName: string | null;
  createdByName: string;
  createdAt: string;
}

// Full frozen snapshot (questions + answers) for viewing/printing.
export interface ServicePlanVersionFull extends ServicePlanVersionSummary {
  serviceUserId: string;
  sections: PspTemplate;
  data: Record<string, unknown>;
}

export const servicePlanVersionsApi = {
  list: (serviceUserId: string) =>
    api.get<ServicePlanVersionSummary[]>('/service-plan-versions', { params: { serviceUserId } }).then((r) => r.data),
  get: (id: string) => api.get<ServicePlanVersionFull>(`/service-plan-versions/${id}`).then((r) => r.data),
  create: (body: { serviceUserId: string; sections: PspTemplate; data: Record<string, unknown>; label?: string; signedByName?: string }) =>
    api.post<ServicePlanVersionSummary>('/service-plan-versions', body).then((r) => r.data),
};
