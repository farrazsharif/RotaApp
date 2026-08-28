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
  list: (serviceUserId: string) =>
    api.get<SupportLogEntry[]>('/support-log', { params: { serviceUserId } }).then((r) => r.data),
};
