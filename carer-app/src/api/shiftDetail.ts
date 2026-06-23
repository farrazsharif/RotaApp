import api from '../lib/axios';
import type { Shift } from '../types';

export const shiftDetailApi = {
  get: (id: string) => api.get<Shift>(`/shifts/${id}`).then((r) => r.data),
};
