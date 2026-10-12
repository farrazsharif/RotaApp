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

// One staff row for the matrix import: name + { course: dateString } map.
export interface TrainingImportRow { name: string; courses: Record<string, string> }
export interface TrainingImportResult {
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  cellCount: number;
  courses: string[];
  matched: { name: string; userId: string; userName: string; cells: number }[];
  unmatched: string[];
  ambiguous: string[];
  committed: boolean;
  written: number;
}

export const trainingApi = {
  list: (userId?: string) =>
    api.get<Training[]>('/training', { params: userId ? { userId } : undefined }).then((r) => r.data),
  // Bulk import the office training matrix: preview (commit:false) or write (commit:true).
  import: (body: { rows: TrainingImportRow[]; commit: boolean }) =>
    api.post<TrainingImportResult>('/training/import', body).then((r) => r.data),
  create: (data: TrainingData) =>
    api.post<Training>('/training', data).then((r) => r.data),
  // Annual refresher: renew every course the staff holds (+1 year expiry).
  refresh: (userId: string, date?: string) =>
    api.post<{ count: number; records: Training[] }>('/training/refresh', { userId, date }).then((r) => r.data),
  update: (id: string, data: Partial<TrainingData>) =>
    api.put<Training>(`/training/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/training/${id}`).then((r) => r.data),
};
