import api from '../lib/axios';
import { User } from '../types';

export const usersApi = {
  list: (params?: { role?: string; active?: boolean }) =>
    api.get<User[]>('/users', { params }).then((r) => r.data),
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),
  create: (data: Partial<User> & { password?: string; sendInvite?: boolean; siteIds?: string[] }) =>
    api.post<User>('/users', data).then((r) => r.data),
  update: (id: string, data: Partial<User> & { siteIds?: string[] }) =>
    api.put<User>(`/users/${id}`, data).then((r) => r.data),
  resetPassword: (id: string, body: { mode: 'email' } | { mode: 'set'; password: string }) =>
    api.post<{ message: string; email?: string }>(`/users/${id}/reset-password`, body).then((r) => r.data),
  resendInvite: (id: string) =>
    api.post<{ message: string; email?: string }>(`/users/${id}/resend-invite`, {}).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
  reactivate: (id: string) =>
    api.post<{ message: string }>(`/users/${id}/reactivate`, {}).then((r) => r.data),
  remove: (id: string) => api.delete(`/users/${id}/permanent`).then((r) => r.data),
};
