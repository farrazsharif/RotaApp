import api from '../lib/axios';
import { Invoice, InvoiceStatus } from '../types';

export const invoicesApi = {
  list: () => api.get<Invoice[]>('/invoices').then((r) => r.data),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`).then((r) => r.data),
  generate: (data: { funderId: string; periodStart: string; periodEnd: string; serviceUserId?: string }) =>
    api.post<Invoice>('/invoices', data).then((r) => r.data),
  update: (id: string, data: { status?: InvoiceStatus; notes?: string; poNumber?: string }) =>
    api.put<Invoice>(`/invoices/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/invoices/${id}`).then((r) => r.data),
};
