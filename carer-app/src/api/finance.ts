import api from '../lib/axios';
import type { FinanceLedger } from '../types';

export const financeApi = {
  list: (serviceUserId: string) =>
    api.get<FinanceLedger>('/financial-transactions', { params: { serviceUserId } }).then((r) => r.data),
  create: (data: {
    serviceUserId: string;
    shiftId: string;
    description: string;
    amountIn?: number;
    amountOut?: number;
    clientSignature?: string;
    unableToSign?: boolean;
    unableReason?: string;
    date?: string;
  }) => api.post<{ id: string }>('/financial-transactions', data).then((r) => r.data),
  uploadReceipt: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ ok: true }>(`/financial-transactions/${id}/receipt`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
