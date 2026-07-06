import api from '../lib/axios';
import { FundingArrangement } from '../types';

export interface FundingData {
  serviceUserId: string;
  funderId: string;
  rate: number;
  startDate?: string;
  endDate?: string;
  poNumber?: string;
  contractRef?: string;
}

export const fundingApi = {
  list: (serviceUserId: string) =>
    api.get<FundingArrangement[]>('/funding', { params: { serviceUserId } }).then((r) => r.data),
  listAll: () => api.get<FundingArrangement[]>('/funding').then((r) => r.data),
  create: (data: FundingData) => api.post<FundingArrangement>('/funding', data).then((r) => r.data),
  update: (id: string, data: Partial<Omit<FundingData, 'serviceUserId'>>) =>
    api.put<FundingArrangement>(`/funding/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/funding/${id}`).then((r) => r.data),
};
