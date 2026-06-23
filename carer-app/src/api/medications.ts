import api from '../lib/axios';
import type { MedAdminStatus } from '../types';

export const medicationsApi = {
  recordAdministration: (data: {
    medicationId: string;
    serviceUserId: string;
    scheduledFor: string;
    status: MedAdminStatus;
    note?: string;
  }) => api.post('/medications/administrations', data).then((r) => r.data),
};
