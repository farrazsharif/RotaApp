import api from '../lib/axios';
import { ServiceUser, ServiceUserStatus } from '../types';

export interface ServiceUserData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  siteId?: string;
  nhsNumber?: string;
  address?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  gpName?: string;
  gpPractice?: string;
  gpPhone?: string;
  gpAddress?: string;
  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyAddress?: string;
  needsMedication?: boolean;
  needsMobility?: boolean;
  needsPersonalCare?: boolean;
  careNotes?: string;
  visitDuration?: number;
  visits?: string; // JSON array of { type, duration }
  preferredCaregiverIds?: string[];
  status?: ServiceUserStatus;
}

export const serviceUsersApi = {
  list: (params?: { search?: string; active?: boolean; siteId?: string; status?: ServiceUserStatus }) =>
    api.get<ServiceUser[]>('/service-users', { params }).then((r) => r.data),
  get: (id: string) => api.get<ServiceUser>(`/service-users/${id}`).then((r) => r.data),
  create: (data: ServiceUserData) =>
    api.post<ServiceUser>('/service-users', data).then((r) => r.data),
  update: (id: string, data: Partial<ServiceUserData>) =>
    api.put<ServiceUser>(`/service-users/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/service-users/${id}`).then((r) => r.data),
};
