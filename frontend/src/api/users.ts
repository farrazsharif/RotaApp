import api from '../lib/axios';
import { User, PermissionKey } from '../types';

export interface ComplianceItem { id: string; label: string; ok: boolean; hint: string; tab?: string; }
export interface ComplianceResult { items: ComplianceItem[]; missing: string[]; total: number; present: number; complete: boolean; }
export interface ComplianceSummaryRow { userId: string; complete: boolean; present: number; total: number; missing: string[]; }

// One DBS row to import (from the office spreadsheet). Name is matched to a
// staff member; the rest are the DBS fields. All strings; dates are parsed server-side.
export interface DbsImportRow {
  name: string;
  positionApplied?: string | null;
  certificateNo?: string | null;
  dateOfIssue?: string | null;
  riskLevel?: string | null;
  issuedBy?: string | null;
  appointingManager?: string | null;
  offenceDisclosed?: string | null;
  offenceDate?: string | null;
  notes?: string | null;
}
export interface DbsImportResult {
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  matched: { name: string; userId: string; userName: string }[];
  unmatched: string[];
  ambiguous: string[];
  committed: boolean;
  updated: number;
}
// The DBS fields that can be saved on a staff record.
export interface DbsFields {
  dbsCertificateNo?: string | null;
  dbsPositionApplied?: string | null;
  dbsDateOfIssue?: string | null;
  dbsRiskLevel?: string | null;
  dbsIssuedBy?: string | null;
  dbsAppointingManager?: string | null;
  dbsOffenceDisclosed?: string | null;
  dbsOffenceDate?: string | null;
  dbsNotes?: string | null;
}

export const usersApi = {
  // Staff-file document compliance: one summary row per active staff member.
  compliance: () => api.get<ComplianceSummaryRow[]>('/users/compliance').then((r) => r.data),
  // Full checklist breakdown for one staff member.
  complianceFor: (id: string) => api.get<ComplianceResult>(`/users/${id}/compliance`).then((r) => r.data),
  // Set (array) or clear (null) a person's per-person permission override.
  setPermissions: (id: string, permissions: PermissionKey[] | null) =>
    api.put<{ permissionsOverride: PermissionKey[] | null; capabilities: PermissionKey[] }>(`/users/${id}/permissions`, { permissions }).then((r) => r.data),
  list: (params?: { role?: string; active?: boolean }) =>
    api.get<User[]>('/users', { params }).then((r) => r.data),
  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),
  create: (data: Partial<User> & { password?: string; sendInvite?: boolean; siteIds?: string[] }) =>
    api.post<User>('/users', data).then((r) => r.data),
  update: (id: string, data: Partial<User> & { siteIds?: string[] }) =>
    api.put<User>(`/users/${id}`, data).then((r) => r.data),
  // DBS record (admin only): save one staff member's DBS fields.
  updateDbs: (id: string, data: DbsFields) =>
    api.put<User>(`/users/${id}/dbs`, data).then((r) => r.data),
  // DBS bulk import (admin only): preview (commit:false) or write (commit:true).
  importDbs: (body: { rows: DbsImportRow[]; commit: boolean }) =>
    api.post<DbsImportResult>('/users/dbs/import', body).then((r) => r.data),
  resetPassword: (id: string, body: { mode: 'email' } | { mode: 'set'; password: string }) =>
    api.post<{ message: string; email?: string }>(`/users/${id}/reset-password`, body).then((r) => r.data),
  resendInvite: (id: string) =>
    api.post<{ message: string; email?: string }>(`/users/${id}/resend-invite`, {}).then((r) => r.data),
  impersonate: (id: string) =>
    api.post<{ token: string; url: string }>(`/users/${id}/impersonate`, {}).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
  reactivate: (id: string) =>
    api.post<{ message: string }>(`/users/${id}/reactivate`, {}).then((r) => r.data),
  remove: (id: string) => api.delete(`/users/${id}/permanent`).then((r) => r.data),
};
