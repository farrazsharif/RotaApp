import api from '../lib/axios';
import type { Medication, MedAdministration } from '../types';

export const medicationsApi = {
  list: (serviceUserId: string) => api.get<Medication[]>(`/family/medications/${serviceUserId}`).then((r) => r.data),
  administrations: (serviceUserId: string, startDate?: string, endDate?: string) =>
    api.get<MedAdministration[]>(`/family/administrations/${serviceUserId}`, { params: { startDate, endDate } }).then((r) => r.data),
};
