import api from '../lib/axios';
import { OrgSettings } from '../types';

export const settingsApi = {
  get: () => api.get<OrgSettings>('/settings').then((r) => r.data),
  update: (data: Partial<OrgSettings>) =>
    api.put<OrgSettings>('/settings', data).then((r) => r.data),
};
