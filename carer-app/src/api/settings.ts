import api from '../lib/axios';

// The carer app only needs the company's visit-checklist config from settings.
export interface CarerOrgSettings {
  companyName?: string;
  callLogTasks?: string | null;
}

export const settingsApi = {
  get: () => api.get<CarerOrgSettings>('/settings').then((r) => r.data),
};
