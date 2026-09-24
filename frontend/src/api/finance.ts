import api from '../lib/axios';
import { FinanceLedger } from '../types';

export interface FinancialTransactionData {
  serviceUserId: string;
  shiftId?: string;
  description: string;
  amountIn?: number;
  amountOut?: number;
  clientSignature?: string;
  unableToSign?: boolean;
  unableReason?: string;
  date?: string;
}

export const financeApi = {
  list: (serviceUserId: string) =>
    api.get<FinanceLedger>('/financial-transactions', { params: { serviceUserId } }).then((r) => r.data),
  create: (body: FinancialTransactionData) =>
    api.post<{ id: string }>('/financial-transactions', body).then((r) => r.data),
  remove: (id: string) => api.delete<{ ok: true }>(`/financial-transactions/${id}`).then((r) => r.data),
  receiptUrl: (id: string) =>
    api.get<{ url: string }>(`/financial-transactions/${id}/receipt`, { params: { inline: '1' } }).then((r) => r.data.url),
  uploadReceipt: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<{ ok: true }>(`/financial-transactions/${id}/receipt`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};
