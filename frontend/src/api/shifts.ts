import api from '../lib/axios';
import { Shift } from '../types';

export interface ShiftFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
  serviceUserId?: string;
  includeCover?: boolean;
}

// Before-state of an assignment change, returned by assignCarer so the client
// can offer a one-click Undo.
export interface AssignUndo {
  shifts: { id: string; userId: string | null; coverCarerIds: string[] }[];
}

// Cancellation billing: a cancelled visit may still be chargeable, priced as
// the full visit, a percentage of it, or a custom flat amount.
export interface CancelBilling {
  billable?: boolean;
  chargeType?: 'FULL' | 'PERCENT' | 'CUSTOM';
  chargePercent?: number;
  chargeAmount?: number;
  reason?: string;
}

export interface CreateShiftData {
  userId?: string | null;
  serviceUserId?: string;
  date: string;
  startTime: string;
  endTime: string;
  visitName?: string;
  cover?: number;
  coverCarerIds?: string[];
  role?: string;
  notes?: string;
  givesMedication?: boolean;
  runId?: string | null;
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
  update: (
    id: string,
    data: Partial<CreateShiftData> & {
      status?: string;
      // Optional series-wide carer propagation, handled in the same request.
      assignScope?: 'one' | 'future' | 'days' | 'range';
      assignDays?: number[];
      assignFrom?: string;
      assignTo?: string;
    },
  ) => api.put<Shift>(`/shifts/${id}`, data).then((r) => r.data),
  // hard: true permanently removes the shift (created-in-error); otherwise it's
  // a cancellation that keeps a CANCELLED record with the billing choice.
  delete: (id: string, opts?: { scope?: 'one' | 'future' | 'days'; days?: number[]; hard?: boolean } & CancelBilling) =>
    api
      .delete(`/shifts/${id}`, {
        params: {
          scope: opts?.scope,
          days: opts?.days && opts.days.length ? opts.days.join(',') : undefined,
          hard: opts?.hard ? '1' : undefined,
          billable: !opts?.hard && opts?.billable ? '1' : undefined,
          chargeType: !opts?.hard && opts?.billable ? opts?.chargeType : undefined,
          chargePercent: !opts?.hard && opts?.billable && opts?.chargeType === 'PERCENT' ? opts?.chargePercent : undefined,
          chargeAmount: !opts?.hard && opts?.billable && opts?.chargeType === 'CUSTOM' ? opts?.chargeAmount : undefined,
          reason: opts?.reason || undefined,
        },
      })
      .then((r) => r.data),
  bulkCreate: (shifts: CreateShiftData[]) =>
    api.post<Shift[]>('/shifts/bulk', { shifts }).then((r) => r.data),
  cancelBulk: (ids: string[], billing?: CancelBilling) =>
    api.post<{ message: string; count: number }>('/shifts/cancel-bulk', { ids, ...(billing || {}) }).then((r) => r.data),
  publish: (id: string) => api.post<Shift>(`/shifts/${id}/publish`).then((r) => r.data),
  publishBulk: (ids: string[], opts?: { notify?: 'none' | 'carers' | 'all'; message?: string }) =>
    api.post<{ message: string; count: number; skipped: number }>('/shifts/publish-bulk', { ids, ...(opts || {}) }).then((r) => r.data),
  assignCarer: (id: string, body: { userId?: string | null; coverCarerIds?: string[]; scope?: 'one' | 'future' | 'days' | 'range'; days?: number[]; fromDate?: string; toDate?: string }) =>
    api.post<{ message: string; count: number; undo?: AssignUndo }>(`/shifts/${id}/assign`, body).then((r) => r.data),
  // Revert a bulk assign/unassign to the before-state returned by assignCarer.
  restoreAssignments: (undo: AssignUndo) =>
    api.post<{ message: string; count: number }>('/shifts/restore-assignments', undo).then((r) => r.data),
};
