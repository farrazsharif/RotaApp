import api from '../lib/axios';
import { sendOrQueue } from '../lib/outbox';
import type { FinanceLedger } from '../types';

export interface FinanceCreateData {
  serviceUserId: string;
  shiftId: string;
  description: string;
  amountIn?: number;
  amountOut?: number;
  clientSignature?: string;
  unableToSign?: boolean;
  unableReason?: string;
  date?: string;
}

function uploadReceipt(id: string, file: File | Blob, name?: string) {
  const form = new FormData();
  form.append('file', file, name || (file as File).name || 'receipt.jpg');
  return api
    .post<{ ok: true }>(`/financial-transactions/${id}/receipt`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
}

export const financeApi = {
  list: (serviceUserId: string) =>
    api.get<FinanceLedger>('/financial-transactions', { params: { serviceUserId } }).then((r) => r.data),

  create: (data: FinanceCreateData) =>
    api.post<{ id: string }>('/financial-transactions', data).then((r) => r.data),

  uploadReceipt,

  // Create the transaction and attach its receipt as ONE unit. The receipt
  // upload needs the id the create returns, so offline both are queued together
  // and replayed in sequence — never a transaction with an orphaned photo.
  createWithReceipt: (data: FinanceCreateData, receipt?: File | null) =>
    sendOrQueue(
      'finance.create',
      { ...data, date: data.date || new Date().toISOString() } as unknown as Record<string, unknown>,
      async () => {
        const res = await api.post<{ id: string }>('/financial-transactions', data).then((r) => r.data);
        if (receipt) await uploadReceipt(res.id, receipt);
        return res;
      },
      receipt ? { receipt, receiptName: receipt.name } : undefined,
    ),
};
