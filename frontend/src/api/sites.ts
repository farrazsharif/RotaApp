import api from '../lib/axios';
import { Site } from '../types';

export const sitesApi = {
  list: () => api.get<Site[]>('/sites').then((r) => r.data),
  create: (data: { name: string; color: string }) =>
    api.post<Site>('/sites', data).then((r) => r.data),
  update: (id: string, data: { name?: string; color?: string }) =>
    api.put<Site>(`/sites/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/sites/${id}`).then((r) => r.data),
};
