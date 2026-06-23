import api from '../lib/axios';
import type { Shift } from '../types';

export const shiftsApi = {
  list: (params: { startDate?: string; endDate?: string; userId?: string }) =>
    api.get<Shift[]>('/shifts', { params }).then((r) => r.data),
};
