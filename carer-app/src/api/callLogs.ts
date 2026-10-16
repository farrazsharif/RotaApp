import api from '../lib/axios';
import { sendOrQueue } from '../lib/outbox';
import type { CallLog } from '../types';
import type { CallLogTaskTick } from '../lib/callLogTasks';

export const callLogsApi = {
  list: (serviceUserId?: string) =>
    api.get<CallLog[]>('/call-logs', { params: serviceUserId ? { serviceUserId } : {} }).then((r) => r.data),
  create: (data: { serviceUserId: string; shiftId?: string; note: string; tasks?: CallLogTaskTick[]; supportDomains?: string[] }) =>
    sendOrQueue('callLog.create', data as unknown as Record<string, unknown>, () =>
      api.post<CallLog>('/call-logs', data).then((r) => r.data)),
  sign: (id: string) => api.post<CallLog>(`/call-logs/${id}/sign`, {}).then((r) => r.data),
};
