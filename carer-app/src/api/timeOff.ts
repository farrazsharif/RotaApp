import api from '../lib/axios';

export type TimeOffType = 'VACATION' | 'SICK' | 'PERSONAL' | 'OTHER';
export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface TimeOffRequest {
  id: string;
  startDate: string;
  endDate: string;
  type: TimeOffType;
  reason: string | null;
  status: TimeOffStatus;
  createdAt: string;
}

export const timeOffApi = {
  mine: () => api.get<TimeOffRequest[]>('/time-off').then((r) => r.data),
  create: (data: { startDate: string; endDate: string; type: TimeOffType; reason?: string }) =>
    api.post<TimeOffRequest>('/time-off', data).then((r) => r.data),
  remove: (id: string) => api.delete(`/time-off/${id}`).then((r) => r.data),
};
