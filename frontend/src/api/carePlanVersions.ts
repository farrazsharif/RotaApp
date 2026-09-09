import api from '../lib/axios';

// Light metadata for the "Previous reviews" list.
export interface CarePlanVersionSummary {
  id: string;
  label: string | null;
  reviewDate: string | null;
  createdByName: string;
  createdAt: string;
}

// Full frozen snapshot of the care plan for viewing/printing read-only.
export interface CarePlanVersionFull extends CarePlanVersionSummary {
  serviceUserId: string;
  data: Record<string, unknown>;
}

export const carePlanVersionsApi = {
  list: (serviceUserId: string) =>
    api.get<CarePlanVersionSummary[]>('/care-plan-versions', { params: { serviceUserId } }).then((r) => r.data),
  get: (id: string) => api.get<CarePlanVersionFull>(`/care-plan-versions/${id}`).then((r) => r.data),
  // The snapshot is built server-side from the stored plan; the client only
  // supplies the client id and an optional review label.
  create: (body: { serviceUserId: string; label?: string }) =>
    api.post<CarePlanVersionSummary>('/care-plan-versions', body).then((r) => r.data),
};
