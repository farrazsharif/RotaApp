import api from '../lib/axios';
import { ImportantDate } from '../types';

export interface ImportantDateData {
  userId: string;
  label: string;
  date: string;
  notes?: string;
}

export const importantDatesApi = {
  list: (userId?: string) =>
    api.get<ImportantDate[]>('/important-dates', { params: userId ? { userId } : undefined }).then((r) => r.data),
  create: (data: ImportantDateData) =>
    api.post<ImportantDate>('/important-dates', data).then((r) => r.data),
  update: (id: string, data: Partial<ImportantDateData>) =>
    api.put<ImportantDate>(`/important-dates/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/important-dates/${id}`).then((r) => r.data),
};
