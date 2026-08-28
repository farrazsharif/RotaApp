import api from '../lib/axios';

export interface SupportLogEntry {
  id: string;
  serviceUserId: string;
  shiftId?: string | null;
  userId?: string | null;
  userName: string;
  body: string;
  domains: string; // JSON array of domain keys
  createdAt: string;
}

export const supportLogApi = {
  list: (shiftId: string) => api.get<SupportLogEntry[]>('/support-log', { params: { shiftId } }).then((r) => r.data),
  create: (data: { serviceUserId: string; shiftId?: string; body: string; domains?: string[] }) =>
    api.post<SupportLogEntry>('/support-log', data).then((r) => r.data),
};
