import api from '../lib/axios';
import type { ClockRecord, DueDose, Shift } from '../types';

export const clockApi = {
  myCalls: (date?: string) =>
    api.get<Shift[]>('/clock/my-calls', { params: date ? { date } : {} }).then((r) => r.data),
  dueMeds: () => api.get<{ doses: DueDose[] }>('/clock/due-meds').then((r) => r.data.doses),
  status: () => api.get<{ clockedIn: boolean; record: ClockRecord | null }>('/clock/status').then((r) => r.data),
  clockIn: (shiftId?: string) => api.post<ClockRecord>('/clock/in', shiftId ? { shiftId } : {}).then((r) => r.data),
  clockOut: () => api.post<ClockRecord>('/clock/out').then((r) => r.data),
};

export interface ClockOutBlockedError {
  error: string;
  pendingMeds: string[];
}
