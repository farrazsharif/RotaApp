import api from '../lib/axios';
import type { CallLog } from '../types';

export const callLogsApi = {
  list: (serviceUserId?: string) =>
    api.get<CallLog[]>('/call-logs', { params: serviceUserId ? { serviceUserId } : {} }).then((r) => r.data),
  create: (data: { serviceUserId: string; shiftId?: string; note: string }) =>
    api.post<CallLog>('/call-logs', data).then((r) => r.data),
};
