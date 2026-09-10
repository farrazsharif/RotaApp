import api from '../lib/axios';
import { ClockRecord, Shift, DueDose, MedStatus } from '../types';

// A single dose due on a visit, with its recorded outcome. Richer than DueDose
// (adds PRN/blister-pack detail and when it was recorded) — returned by the
// per-visit shift-meds endpoint used in the Attendance shift-detail panel.
export interface ShiftDose {
  medicationId: string;
  name: string;
  dose: string | null;
  route: string | null;
  isBlisterPack: boolean;
  packContents: string | null;
  time: string; // "HH:MM"; empty for PRN
  prn: boolean;
  scheduledFor: string; // ISO
  status: MedStatus | null;
  recordedAt: string | null; // ISO
}

export const clockApi = {
  myCalls: (date?: string) => api.get<Shift[]>('/clock/my-calls', { params: { date } }).then((r) => r.data),
  dueMeds: () => api.get<{ doses: DueDose[] }>('/clock/due-meds').then((r) => r.data),
  clockIn: (shiftId?: string) => api.post<ClockRecord>('/clock/in', { shiftId }).then((r) => r.data),
  clockOut: () => api.post<ClockRecord>('/clock/out').then((r) => r.data),
  status: () => api.get<{ clockedIn: boolean; record: ClockRecord | null }>('/clock/status').then((r) => r.data),
  active: () => api.get<ClockRecord[]>('/clock/active').then((r) => r.data),
  records: (params?: { userId?: string; startDate?: string; endDate?: string }) =>
    api.get<ClockRecord[]>('/clock/records', { params }).then((r) => r.data),
  // A single visit's medication doses with their recorded status (office/manager
  // read-only view; also used by the carer app for their own visits).
  shiftMeds: (shiftId: string) =>
    api.get<{ doses: ShiftDose[] }>(`/clock/shift-meds/${shiftId}`).then((r) => r.data.doses),
  updateRecord: (id: string, data: { clockIn?: string; clockOut?: string }) =>
    api.put<ClockRecord>(`/clock/records/${id}`, data).then((r) => r.data),
  // Remove an erroneous/duplicate clock record (e.g. a stranded double clock-in).
  deleteRecord: (id: string) => api.delete<{ ok: boolean }>(`/clock/records/${id}`).then((r) => r.data),
  // Office backfill of a missed visit's clock in/out, attributed to the carer.
  createRecord: (data: { shiftId: string; userId?: string; clockIn: string; clockOut?: string }) =>
    api.post<ClockRecord>('/clock/records', data).then((r) => r.data),
};
