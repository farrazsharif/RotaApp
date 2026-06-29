import api from '../lib/axios';

export const authApi = {
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data).then((r) => r.data),
  checkSetPasswordToken: (token: string) =>
    api.get<{ valid: boolean }>(`/auth/set-password/${token}`).then((r) => r.data),
  setPassword: (data: { token: string; password: string }) =>
    api.post('/auth/set-password', data).then((r) => r.data),
};
