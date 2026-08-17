import api from '../lib/axios';
import { DashboardStats } from '../types';

export interface HoursRow {
  userId: string; name: string; totalHours: number; totalPay: number; records: number;
}
export interface OvertimeRow {
  userId: string; name: string; weekStarting: string; regularHours: number; overtimeHours: number; totalHours: number;
}
export interface CoverageDay {
  date: string; scheduledCount: number; scheduledHours: number; shifts: unknown[];
}
export interface ScheduledHoursRow {
  userId: string; name: string; hourlyRate: number; days: number[]; total: number; visits: number; estPay: number;
  contracted?: number | null; // By-patient mode only: council-agreed weekly hours
}
export interface CribSheetRow {
  employee: string; position: string; serviceUser: string; date: string;
  startTime: string; endTime: string; clockIn: string | null; clockOut: string | null; totalHours: number;
}
export interface LateCheckinRow {
  id: string; startTime: string; endTime: string; visitName: string | null;
  serviceUserName: string; serviceUserPhone: string | null; carers: string[]; minutesLate: number;
}
export interface MissedMedRow {
  id: string; doseTime: string; medName: string; medDose: string | null;
  serviceUserName: string; carerName: string | null;
  visitName: string | null; visitStart: string | null; visitEnd: string | null; note: string | null;
}
export interface EcmRow {
  shiftId: string; date: string; serviceUser: string; site: string; carer: string; visitName: string | null;
  scheduledStart: string; scheduledEnd: string; scheduledMins: number;
  clockIn: string | null; clockOut: string | null; actualMins: number | null; variance: number | null;
  status: 'attended' | 'no_clock_out' | 'not_attended'; short: boolean; ecmNote: string;
}

export const reportsApi = {
  dashboard: () => api.get<DashboardStats>('/reports/dashboard').then((r) => r.data),
  lateCheckins: () => api.get<LateCheckinRow[]>('/reports/late-checkins').then((r) => r.data),
  missedMeds: () => api.get<MissedMedRow[]>('/reports/missed-meds').then((r) => r.data),
  hours: (params: { startDate: string; endDate: string; userId?: string }) =>
    api.get<HoursRow[]>('/reports/hours', { params }).then((r) => r.data),
  overtime: (params: { startDate: string; endDate: string }) =>
    api.get<OvertimeRow[]>('/reports/overtime', { params }).then((r) => r.data),
  coverage: (params: { startDate: string; endDate: string }) =>
    api.get<CoverageDay[]>('/reports/coverage', { params }).then((r) => r.data),
  scheduledHours: (params: { startDate: string; endDate: string; siteId?: string; role?: string; userId?: string; serviceUserId?: string; groupBy?: string }) =>
    api.get<ScheduledHoursRow[]>('/reports/scheduled-hours', { params }).then((r) => r.data),
  cribSheet: (params: { startDate: string; endDate: string; siteId?: string; role?: string; userId?: string; serviceUserId?: string }) =>
    api.get<CribSheetRow[]>('/reports/crib-sheet', { params }).then((r) => r.data),
  shiftRoles: () => api.get<string[]>('/reports/shift-roles').then((r) => r.data),
  ecm: (params: { startDate: string; endDate: string; siteId?: string; userId?: string; serviceUserId?: string; view?: string }) =>
    api.get<EcmRow[]>('/reports/ecm', { params }).then((r) => r.data),
  saveEcmNote: (shiftId: string, note: string) =>
    api.post('/reports/ecm-note', { shiftId, note }).then((r) => r.data),
};
