import api from '../lib/axios';
import { AuditLog } from '../types';

export interface AuditFilters {
  from?: string; // yyyy-MM-dd
  to?: string;   // yyyy-MM-dd
  q?: string;    // free-text search
}

export const auditApi = {
  list: (filters?: AuditFilters) =>
    api.get<AuditLog[]>('/audit', { params: filters }).then((r) => r.data),
};
