import api from '../lib/axios';

export const POLICY_CATEGORIES: { key: string; label: string }[] = [
  { key: 'SAFEGUARDING', label: 'Safeguarding' },
  { key: 'MEDICATION', label: 'Medication' },
  { key: 'HEALTH_SAFETY', label: 'Health & safety' },
  { key: 'IPC', label: 'Infection prevention' },
  { key: 'HR', label: 'Staff & HR' },
  { key: 'DATA', label: 'Data protection' },
  { key: 'CARE', label: 'Care delivery' },
  { key: 'COMPLAINTS', label: 'Complaints' },
  { key: 'BUSINESS_CONTINUITY', label: 'Business continuity' },
  { key: 'OTHER', label: 'Other' },
];

// The stored document. The storage key never leaves the server — a download
// mints a short-lived signed URL per request.
export interface PolicyFileSummary {
  fileName: string;
  contentType: string;
  size: number;
}

export interface Policy {
  id: string;
  title: string;
  category: string;
  // The date it was last reviewed. Null means no review has been recorded,
  // which the dashboard counts the same as one long overdue.
  reviewedAt: string | null;
  files: PolicyFileSummary[];
  updatedAt: string;
}

export interface PolicyInput {
  title?: string;
  category?: string;
  reviewedAt?: string | null;
}

export const categoryLabel = (key: string) =>
  POLICY_CATEGORIES.find((c) => c.key === key)?.label || key;

export const policiesApi = {
  list: (params?: { category?: string }) =>
    api.get<Policy[]>('/policies', { params }).then((r) => r.data),
  get: (id: string) => api.get<Policy>(`/policies/${id}`).then((r) => r.data),
  create: (body: PolicyInput) => api.post<Policy>('/policies', body).then((r) => r.data),
  update: (id: string, body: PolicyInput) => api.patch<Policy>(`/policies/${id}`, body).then((r) => r.data),
  // No remove. A policy is a record of what the service runs on, and deleting
  // one from the screen is how a register quietly loses a document nobody
  // noticed was there. The API can still do it if a bad row ever needs lifting.

  attachment: (id: string) =>
    api.get<{ url: string; fileName: string }>(`/policies/${id}/attachment`).then((r) => r.data),
  attach: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<PolicyFileSummary>(`/policies/${id}/attachment`, form).then((r) => r.data);
  },
  removeAttachment: (id: string) => api.delete(`/policies/${id}/attachment`).then((r) => r.data),
};
