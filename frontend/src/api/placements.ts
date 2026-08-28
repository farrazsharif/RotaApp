import api from '../lib/axios';
import { Placement } from '../types';

export interface PlacementInput {
  serviceUserId?: string;
  carerId?: string;
  startDate?: string;
  endDate?: string;
  nightType?: string;
  status?: string;
  note?: string;
}

export const placementsApi = {
  // Optionally windowed by from/to (yyyy-MM-dd) — returns placements overlapping it.
  list: (params?: { from?: string; to?: string }) =>
    api.get<Placement[]>('/placements', { params: params || {} }).then((r) => r.data),
  create: (data: PlacementInput) => api.post<Placement>('/placements', data).then((r) => r.data),
  update: (id: string, data: PlacementInput) => api.patch<Placement>(`/placements/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/placements/${id}`).then((r) => r.data),
};
