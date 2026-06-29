import api from '../lib/axios';
import type { User } from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }).then((r) => r.data),
  checkSetPasswordToken: (token: string) =>
    api.get<{ valid: boolean }>(`/auth/set-password/${token}`).then((r) => r.data),
  setPassword: (data: { token: string; password: string }) =>
    api.post('/auth/set-password', data).then((r) => r.data),
};
