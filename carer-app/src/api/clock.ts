import api from '../lib/axios';
import type { ClockRecord, DueDose, Shift } from '../types';

export const clockApi = {
  myCalls: (date?: string) =>
    api.get<Shift[]>('/clock/my-calls', { params: date ? { date } : {} }).then((r) => r.data),
  dueMeds: () => api.get<{ doses: DueDose[] }>('/clock/due-meds').then((r) => r.data.doses),
  // A specific visit's doses (with recorded status) regardless of clock state —
  // so meds stay visible for review after the call is completed.
  shiftMeds: (shiftId: string) => api.get<{ doses: DueDose[] }>(`/clock/shift-meds/${shiftId}`).then((r) => r.data.doses),
  status: () => api.get<{ clockedIn: boolean; record: ClockRecord | null }>('/clock/status').then((r) => r.data),
  clockIn: (shiftId?: string) => api.post<ClockRecord>('/clock/in', shiftId ? { shiftId } : {}).then((r) => r.data),
  clockOut: () => api.post<ClockRecord>('/clock/out').then((r) => r.data),
  // Correct the actual start and/or end time on your own record (forgot to
  // clock in/out).
  setTimes: (recordId: string, body: { startTime?: string; endTime?: string }) =>
    api.post<ClockRecord>(`/clock/records/${recordId}/times`, body).then((r) => r.data),
  // Record a PAST visit you forgot to clock in/out for — creates the completed
  // record yourself (own assigned visits, within a 7-day window).
  recordMissed: (shiftId: string, body: { clockIn: string; clockOut: string }) =>
    api.post<ClockRecord>('/clock/records/self', { shiftId, ...body }).then((r) => r.data),
};

export interface ClockOutBlockedError {
  error: string;
  pendingMeds: string[];
}
