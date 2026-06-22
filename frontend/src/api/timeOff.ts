import api from '../lib/axios';
import { TimeOffRequest } from '../types';

export const timeOffApi = {
  list: (params?: { status?: string }) =>
    api.get<TimeOffRequest[]>('/time-off', { params }).then((r) => r.data),
  create: (data: { startDate: string; endDate: string; type: string; reason?: string }) =>
    api.post<TimeOffRequest>('/time-off', data).then((r) => r.data),
  update: (id: string, status: 'APPROVED' | 'REJECTED') =>
    api.put<TimeOffRequest>(`/time-off/${id}`, { status }).then((r) => r.data),
  delete: (id: string) => api.delete(`/time-off/${id}`).then((r) => r.data),
};
