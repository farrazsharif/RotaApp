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

export const AUDIENCES: { key: string; label: string; hint: string }[] = [
  { key: 'ALL', label: 'Everyone', hint: 'Office and carers alike.' },
  { key: 'CARERS', label: 'Carers only', hint: 'Field staff. Office managers are not asked.' },
  { key: 'OFFICE', label: 'Office only', hint: 'Managers and admins.' },
  { key: 'MANAGERS', label: 'Managers only', hint: 'Managers and admins.' },
];

// The original document, kept alongside the text rather than instead of it.
// The text reflows and searches; the file has the tables as tables and is what
// gets printed. The storage key never leaves the server - a download mints a
// short-lived signed URL per request.
export interface PolicyFileSummary {
  fileName: string;
  contentType: string;
  size: number;
}

export type PolicyStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface PolicySummary {
  id: string;
  title: string;
  reference: string | null;
  category: string;
  version: string;
  issuedAt: string;
  reviewDate: string | null;
  audience: string;
  requiresAck: boolean;
  status: PolicyStatus;
  updatedAt: string;
  owner?: { id: string; firstName: string; lastName: string } | null;
  files: PolicyFileSummary[];
  dueCount: number;
  signedCount: number;
}

export interface PolicyPerson {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface Policy extends Omit<PolicySummary, 'dueCount' | 'signedCount'> {
  bodyText: string | null;
  attachments: string;
  createdAt: string;
  acknowledgements: {
    id: string;
    version: string;
    signedAt: string;
    user: PolicyPerson;
  }[];
  due: PolicyPerson[];
  outstanding: PolicyPerson[];
}

export interface MyPolicy extends Omit<PolicySummary, 'dueCount' | 'signedCount'> {
  bodyText: string | null;
  attachments: string;
  signedAt: string | null;
  needsSignature: boolean;
}

export interface PolicyInput {
  title?: string;
  reference?: string | null;
  category?: string;
  bodyText?: string | null;
  version?: string;
  issuedAt?: string | null;
  reviewDate?: string | null;
  audience?: string;
  requiresAck?: boolean;
  status?: PolicyStatus;
  ownerId?: string | null;
}

export const categoryLabel = (key: string) =>
  POLICY_CATEGORIES.find((c) => c.key === key)?.label || key;
export const audienceLabel = (key: string) => AUDIENCES.find((a) => a.key === key)?.label || key;

export const policiesApi = {
  list: (params?: { status?: string; category?: string }) =>
    api.get<PolicySummary[]>('/policies', { params }).then((r) => r.data),
  mine: () => api.get<MyPolicy[]>('/policies/mine').then((r) => r.data),
  get: (id: string) => api.get<Policy>(`/policies/${id}`).then((r) => r.data),
  create: (body: PolicyInput) => api.post<PolicySummary>('/policies', body).then((r) => r.data),
  update: (id: string, body: PolicyInput) =>
    api.patch<PolicySummary>(`/policies/${id}`, body).then((r) => r.data),
  sign: (id: string) => api.post(`/policies/${id}/sign`).then((r) => r.data),

  attachment: (id: string) =>
    api.get<{ url: string; fileName: string }>(`/policies/${id}/attachment`).then((r) => r.data),
  attach: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<PolicyFileSummary>(`/policies/${id}/attachment`, form)
      .then((r) => r.data);
  },
  removeAttachment: (id: string) => api.delete(`/policies/${id}/attachment`).then((r) => r.data),
  remove: (id: string) => api.delete(`/policies/${id}`).then((r) => r.data),
};
