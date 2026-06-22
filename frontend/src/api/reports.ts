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
}
export interface CribSheetRow {
  employee: string; position: string; serviceUser: string; date: string;
  startTime: string; endTime: string; clockIn: string | null; clockOut: string | null; totalHours: number;
}

export const reportsApi = {
  dashboard: () => api.get<DashboardStats>('/reports/dashboard').then((r) => r.data),
  hours: (params: { startDate: string; endDate: string; userId?: string }) =>
    api.get<HoursRow[]>('/reports/hours', { params }).then((r) => r.data),
  overtime: (params: { startDate: string; endDate: string }) =>
    api.get<OvertimeRow[]>('/reports/overtime', { params }).then((r) => r.data),
  coverage: (params: { startDate: string; endDate: string }) =>
    api.get<CoverageDay[]>('/reports/coverage', { params }).then((r) => r.data),
  scheduledHours: (params: { startDate: string; endDate: string }) =>
    api.get<ScheduledHoursRow[]>('/reports/scheduled-hours', { params }).then((r) => r.data),
  cribSheet: (params: { startDate: string; endDate: string }) =>
    api.get<CribSheetRow[]>('/reports/crib-sheet', { params }).then((r) => r.data),
};
