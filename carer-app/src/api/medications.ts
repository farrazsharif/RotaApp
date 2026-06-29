import api from '../lib/axios';
import type { MedAdminStatus, Medication, MedAdministration } from '../types';

export const medicationsApi = {
  recordAdministration: (data: {
    medicationId: string;
    serviceUserId: string;
    scheduledFor: string;
    status: MedAdminStatus;
    note?: string;
  }) => api.post('/medications/administrations', data).then((r) => r.data),
  list: (serviceUserId: string) =>
    api.get<Medication[]>('/medications', { params: { serviceUserId } }).then((r) => r.data),
  administrations: (serviceUserId: string, startDate: string, endDate: string) =>
    api.get<MedAdministration[]>('/medications/administrations', { params: { serviceUserId, startDate, endDate } }).then((r) => r.data),
};
