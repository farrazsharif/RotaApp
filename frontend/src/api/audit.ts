import api from '../lib/axios';
import { AuditLog } from '../types';

export const auditApi = {
  list: () => api.get<AuditLog[]>('/audit').then((r) => r.data),
};
