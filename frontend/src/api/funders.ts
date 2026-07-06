import api from '../lib/axios';
import { Funder } from '../types';

export interface FunderData {
  name: string;
  type: string; // COUNCIL | PRIVATE | NHS_CHC
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  poReference?: string;
  paymentTermsDays?: number;
  vatExempt?: boolean;
  notes?: string;
}

export const fundersApi = {
  list: () => api.get<Funder[]>('/funders').then((r) => r.data),
  create: (data: FunderData) => api.post<Funder>('/funders', data).then((r) => r.data),
  update: (id: string, data: Partial<FunderData>) => api.put<Funder>(`/funders/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/funders/${id}`).then((r) => r.data),
};
