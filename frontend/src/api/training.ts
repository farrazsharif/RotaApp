import api from '../lib/axios';
import { Training } from '../types';

export interface TrainingData {
  userId: string;
  course: string;
  date: string;
  expiresAt?: string;
  accredited?: boolean;
  description?: string;
}

export const trainingApi = {
  list: (userId?: string) =>
    api.get<Training[]>('/training', { params: userId ? { userId } : undefined }).then((r) => r.data),
  create: (data: TrainingData) =>
    api.post<Training>('/training', data).then((r) => r.data),
  update: (id: string, data: Partial<TrainingData>) =>
    api.put<Training>(`/training/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/training/${id}`).then((r) => r.data),
};
