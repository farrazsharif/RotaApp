import api from '../lib/axios';
import { OrgSettings, PermissionsResponse, PermissionMap } from '../types';

export const settingsApi = {
  get: () => api.get<OrgSettings>('/settings').then((r) => r.data),
  update: (data: Partial<OrgSettings>) =>
    api.put<OrgSettings>('/settings', data).then((r) => r.data),
  getPermissions: () => api.get<PermissionsResponse>('/settings/permissions').then((r) => r.data),
  updatePermissions: (permissions: PermissionMap) =>
    api.put<PermissionsResponse>('/settings/permissions', { permissions }).then((r) => r.data),
};
