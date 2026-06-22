import api from '../lib/axios';

export const authApi = {
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/auth/change-password', data).then((r) => r.data),
};
