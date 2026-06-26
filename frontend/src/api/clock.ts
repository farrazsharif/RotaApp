import api from '../lib/axios';
import { ClockRecord, Shift, DueDose } from '../types';

export const clockApi = {
  myCalls: (date?: string) => api.get<Shift[]>('/clock/my-calls', { params: { date } }).then((r) => r.data),
  dueMeds: () => api.get<{ doses: DueDose[] }>('/clock/due-meds').then((r) => r.data),
  clockIn: (shiftId?: string) => api.post<ClockRecord>('/clock/in', { shiftId }).then((r) => r.data),
  clockOut: () => api.post<ClockRecord>('/clock/out').then((r) => r.data),
  status: () => api.get<{ clockedIn: boolean; record: ClockRecord | null }>('/clock/status').then((r) => r.data),
  active: () => api.get<ClockRecord[]>('/clock/active').then((r) => r.data),
  records: (params?: { userId?: string; startDate?: string; endDate?: string }) =>
    api.get<ClockRecord[]>('/clock/records', { params }).then((r) => r.data),
  updateRecord: (id: string, data: { clockIn?: string; clockOut?: string }) =>
    api.put<ClockRecord>(`/clock/records/${id}`, data).then((r) => r.data),
};
