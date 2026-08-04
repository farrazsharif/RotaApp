import api from '../lib/axios';
import { Medication, MedAdministration, MedStatus, BodyMapPoint } from '../types';

export interface MedicationData {
  serviceUserId: string;
  name: string;
  dose?: string;
  route?: string;
  instructions?: string;
  isBlisterPack?: boolean;
  packContents?: string;
  times?: string[];
  daysOfWeek?: number[];
  applicationSites?: BodyMapPoint[];
  startDate?: string;
  endDate?: string;
}

export const medicationsApi = {
  list: (serviceUserId: string) =>
    api.get<Medication[]>('/medications', { params: { serviceUserId } }).then((r) => r.data),
  create: (data: MedicationData) => api.post<Medication>('/medications', data).then((r) => r.data),
  update: (id: string, data: Partial<MedicationData> & { active?: boolean }) =>
    api.put<Medication>(`/medications/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/medications/${id}`).then((r) => r.data),

  administrations: (serviceUserId: string, date: string) =>
    api.get<MedAdministration[]>('/medications/administrations', { params: { serviceUserId, date } }).then((r) => r.data),
  administrationsRange: (serviceUserId: string, startDate: string, endDate: string) =>
    api.get<MedAdministration[]>('/medications/administrations', { params: { serviceUserId, startDate, endDate } }).then((r) => r.data),
  // Dose slots (medicationId + scheduledFor ISO) whose visit was cancelled — for the MAR chart's "C" markers.
  cancelledDoses: (serviceUserId: string, startDate: string, endDate: string) =>
    api.get<{ medicationId: string; scheduledFor: string }[]>('/medications/cancelled-doses', { params: { serviceUserId, startDate, endDate } }).then((r) => r.data),
  recentAdministrations: (recent = 100) =>
    api.get<MedAdministration[]>('/medications/administrations', { params: { recent } }).then((r) => r.data),
  // Filterable log for the eMAR page: by status and/or date range (or recent N).
  queryAdministrations: (params: { startDate?: string; endDate?: string; status?: MedStatus; recent?: number }) =>
    api.get<MedAdministration[]>('/medications/administrations', { params }).then((r) => r.data),
  record: (data: { medicationId: string; serviceUserId: string; scheduledFor: string; status: MedStatus; note?: string }) =>
    api.post<MedAdministration>('/medications/administrations', data).then((r) => r.data),
  // Office record/correction from the portal: can attribute to a carer, set the
  // actual time given, and is audited. Creates a missing record or edits one.
  recordManage: (data: { medicationId: string; serviceUserId: string; scheduledFor: string; status: MedStatus; note?: string; userId?: string | null; recordedAt?: string }) =>
    api.post<MedAdministration>('/medications/administrations/manage', data).then((r) => r.data),
};
