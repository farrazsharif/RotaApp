import api from '../lib/axios';
import { AgedDebt, Payment } from '../types';

export const paymentsApi = {
  create: (data: { invoiceId: string; amount: number; date?: string; method?: string; reference?: string; notes?: string }) =>
    api.post<Payment>('/payments', data).then((r) => r.data),
  delete: (id: string) => api.delete(`/payments/${id}`).then((r) => r.data),
  agedDebt: () => api.get<AgedDebt>('/payments/aged-debt').then((r) => r.data),
};
