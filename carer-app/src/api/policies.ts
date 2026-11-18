import api from '../lib/axios'

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
  bodyText: string | null
  attachments: string
  signedAt: string | null
  needsSignature: boolean
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
  sign: (id: string) => api.post(`/policies/${id}/sign`).then((r) => r.data),
}
