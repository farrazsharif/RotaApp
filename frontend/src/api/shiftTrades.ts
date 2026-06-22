import api from '../lib/axios';
import { ShiftTrade } from '../types';

export const tradesApi = {
  list: (params?: { status?: string }) =>
    api.get<ShiftTrade[]>('/shift-trades', { params }).then((r) => r.data),
  create: (data: { shiftId: string; targetUserId?: string; targetShiftId?: string; message?: string }) =>
    api.post<ShiftTrade>('/shift-trades', data).then((r) => r.data),
  respond: (id: string, action: 'accept' | 'reject') =>
    api.put<ShiftTrade>(`/shift-trades/${id}/respond`, { action }).then((r) => r.data),
  approve: (id: string, action: 'approve' | 'reject') =>
    api.put<ShiftTrade>(`/shift-trades/${id}/approve`, { action }).then((r) => r.data),
  cancel: (id: string) => api.put(`/shift-trades/${id}/cancel`).then((r) => r.data),
};
