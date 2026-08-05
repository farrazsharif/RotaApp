import api from '../lib/axios';
import { CallLog } from '../types';

export const callLogsApi = {
  list: (serviceUserId?: string) =>
    api.get<CallLog[]>('/call-logs', { params: { serviceUserId } }).then((r) => r.data),
  create: (data: { serviceUserId: string; shiftId?: string; note: string }) =>
    api.post<CallLog>('/call-logs', data).then((r) => r.data),
  // Office backfill: record a visit's log attributed to the carer (asUserId).
  createManage: (data: { serviceUserId: string; shiftId?: string; note: string; asUserId?: string }) =>
    api.post<CallLog>('/call-logs/manage', data).then((r) => r.data),
  update: (id: string, note: string) =>
    api.put<CallLog>(`/call-logs/${id}`, { note }).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/call-logs/${id}`).then((r) => r.data),
};
