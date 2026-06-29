import api from '../lib/axios';
import type { ServiceUser } from '../types';

export const serviceUsersApi = {
  list: () => api.get<ServiceUser[]>('/family/service-users').then((r) => r.data),
  get: (id: string) => api.get<ServiceUser>(`/family/service-users/${id}`).then((r) => r.data),
};
