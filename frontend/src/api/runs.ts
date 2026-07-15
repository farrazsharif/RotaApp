import api from '../lib/axios';
import { Run } from '../types';

export const runsApi = {
  list: () => api.get<Run[]>('/runs').then((r) => r.data),
  create: (data: { name: string; color?: string; carerIds?: string[] }) =>
    api.post<Run>('/runs', data).then((r) => r.data),
  update: (id: string, data: { name?: string; color?: string; order?: number; active?: boolean; carerIds?: string[] }) =>
    api.patch<Run>(`/runs/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/runs/${id}`).then((r) => r.data),
  // Push the run's team onto its calls; returns how many calls are being updated.
  applyTeam: (id: string, scope: 'future' | 'all' = 'future') =>
    api.post<{ message: string; count: number }>(`/runs/${id}/apply-team`, { scope }).then((r) => r.data),
};
