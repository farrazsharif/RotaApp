import api from '../lib/axios';

export interface RespitePeriod {
  id: string;
  serviceUserId: string;
  startAt: string;
  endAt: string;
  note: string | null;
  cancelledCount: number;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
}

export const respiteApi = {
  list: (serviceUserId: string) =>
    api.get<RespitePeriod[]>('/respite', { params: { serviceUserId } }).then((r) => r.data),
  create: (body: { serviceUserId: string; startAt: string; endAt: string; note?: string }) =>
    api.post<RespitePeriod>('/respite', body).then((r) => r.data),
  remove: (id: string) => api.delete(`/respite/${id}`).then((r) => r.data),
};
