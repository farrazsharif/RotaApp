import api from '../lib/axios';
import { Site } from '../types';

export interface SiteData {
  name?: string;
  color?: string;
  supportedLiving?: boolean;
  housingProvider?: string | null;
  housingOfficerName?: string | null;
  housingOfficerPhone?: string | null;
  housingOfficerEmail?: string | null;
}

export const sitesApi = {
  list: () => api.get<Site[]>('/sites').then((r) => r.data),
  create: (data: SiteData & { name: string; color: string }) =>
    api.post<Site>('/sites', data).then((r) => r.data),
  update: (id: string, data: SiteData) =>
    api.put<Site>(`/sites/${id}`, data).then((r) => r.data),
  reorder: (ids: string[]) => api.put('/sites/reorder', { ids }).then((r) => r.data),
  delete: (id: string) => api.delete(`/sites/${id}`).then((r) => r.data),
};
