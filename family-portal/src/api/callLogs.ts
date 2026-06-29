import api from '../lib/axios';
import type { CallLog } from '../types';

export const callLogsApi = {
  list: (serviceUserId: string) => api.get<CallLog[]>(`/family/call-logs/${serviceUserId}`).then((r) => r.data),
};
