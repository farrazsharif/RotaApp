import api from '../lib/axios'

// The list carries no policy text: a full library is megabytes of it, and a
// phone on mobile data should not download all of that to show a list of
// titles. The body arrives from mine(id) when one is opened.
export interface MyPolicy {
  id: string
  title: string
  reference: string | null
  category: string
  version: string
  issuedAt: string
  reviewDate: string | null
  audience: string
  requiresAck: boolean
  status: string
  signedAt: string | null
  needsSignature: boolean
}

export interface MyPolicyDetail extends MyPolicy {
  bodyText: string | null
  attachments: string
}

export const CATEGORY_LABEL: Record<string, string> = {
  SAFEGUARDING: 'Safeguarding',
  MEDICATION: 'Medication',
  HEALTH_SAFETY: 'Health & safety',
  IPC: 'Infection prevention',
  HR: 'Staff & HR',
  DATA: 'Data protection',
  CARE: 'Care delivery',
  COMPLAINTS: 'Complaints',
  BUSINESS_CONTINUITY: 'Business continuity',
  OTHER: 'Other',
}

export const policiesApi = {
  mine: () => api.get<MyPolicy[]>('/policies/mine').then((r) => r.data),
  one: (id: string) => api.get<MyPolicyDetail>(`/policies/mine/${id}`).then((r) => r.data),
  sign: (id: string) => api.post(`/policies/${id}/sign`).then((r) => r.data),
}
