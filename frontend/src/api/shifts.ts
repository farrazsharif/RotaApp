import api from '../lib/axios';
import { Shift } from '../types';

export interface ShiftFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export interface CreateShiftData {
  userId?: string;
  serviceUserId?: string;
  date: string;
  startTime: string;
  endTime: string;
  visitName?: string;
  cover?: number;
  coverCarerIds?: string[];
  role?: string;
  notes?: string;
  repeat?: {
    daysOfWeek: number[];
    endType: 'date' | 'permanent';
    endDate?: string;
  };
}

export const shiftsApi = {
  list: (filters?: ShiftFilters) =>
    api.get<Shift[]>('/shifts', { params: filters }).then((r) => r.data),
  get: (id: string) => api.get<Shift>(`/shifts/${id}`).then((r) => r.data),
  create: (data: CreateShiftData) => api.post<Shift>('/shifts', data).then((r) => r.data),
  update: (id: string, data: Partial<CreateShiftData> & { status?: string }) =>
    api.put<Shift>(`/shifts/${id}`, data).then((r) => r.data),
  delete: (id: string, opts?: { scope?: 'one' | 'future' | 'days'; days?: number[] }) =>
    api
      .delete(`/shifts/${id}`, {
        params: {
          scope: opts?.scope,
          days: opts?.days && opts.days.length ? opts.days.join(',') : undefined,
        },
      })
      .then((r) => r.data),
  bulkCreate: (shifts: CreateShiftData[]) =>
    api.post<Shift[]>('/shifts/bulk', { shifts }).then((r) => r.data),
  cancelBulk: (ids: string[]) =>
    api.post<{ message: string; count: number }>('/shifts/cancel-bulk', { ids }).then((r) => r.data),
  publish: (id: string) => api.post<Shift>(`/shifts/${id}/publish`).then((r) => r.data),
  publishBulk: (ids: string[]) =>
    api.post<{ message: string; count: number }>('/shifts/publish-bulk', { ids }).then((r) => r.data),
  assignCarer: (id: string, body: { userId?: string; coverCarerIds?: string[]; scope?: 'one' | 'future' | 'days'; days?: number[] }) =>
    api.post<{ message: string; count: number }>(`/shifts/${id}/assign`, body).then((r) => r.data),
};
