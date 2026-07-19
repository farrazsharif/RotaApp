import api from '../lib/axios';
import { ServiceUser, ServiceUserStatus } from '../types';

export interface ServiceUserData {
  firstName: string;
  lastName: string;
  title?: string;
  preferredName?: string;
  gender?: string;
  ethnicOrigin?: string;
  dateOfBirth: string;
  serviceStartDate?: string;
  photo?: string;
  siteId?: string;
  nhsNumber?: string;
  packageId?: string;
  grabSheet?: string;
  address?: string;
  postcode?: string;
  keySafe?: string;
  medsSafeCode?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactMobile?: string;
  emergencyContactAddress?: string;
  emergencyContactRelation?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinMobile?: string;
  nextOfKinAddress?: string;
  nextOfKinRelation?: string;
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
  contractedWeeklyHours?: number | null;
  visitDuration?: number;
  visits?: string; // JSON array of { type, duration }
  supportCategories?: string; // JSON array of CQC PIR category labels
  preferredCaregiverIds?: string[];
  status?: ServiceUserStatus;
  // When set alongside a status change, the moment the new status takes effect
  // (ISO string). Defaults to now on the server if omitted.
  statusEffectiveAt?: string;
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
