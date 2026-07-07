import api from '../lib/axios';
import { BankHoliday } from '../types';

export const bankHolidaysApi = {
  list: () => api.get<BankHoliday[]>('/bank-holidays').then((r) => r.data),
  create: (data: { date: string; name: string }) =>
    api.post<BankHoliday>('/bank-holidays', data).then((r) => r.data),
  delete: (id: string) => api.delete(`/bank-holidays/${id}`).then((r) => r.data),
};
