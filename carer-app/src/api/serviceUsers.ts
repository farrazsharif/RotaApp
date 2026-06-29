import api from '../lib/axios';
import type { ServiceUser } from '../types';

export const serviceUsersApi = {
  get: (id: string) => api.get<ServiceUser>(`/service-users/${id}`).then((r) => r.data),
};
