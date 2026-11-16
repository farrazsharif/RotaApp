import api from '../lib/axios';

// The Care Act 2014 categories of abuse and neglect, with the wording an
// inspector and a manager both recognise.
export const HARM_TYPES: { key: string; label: string }[] = [
  { key: 'PHYSICAL', label: 'Physical' },
  { key: 'DOMESTIC', label: 'Domestic abuse' },
  { key: 'SEXUAL', label: 'Sexual' },
  { key: 'PSYCHOLOGICAL', label: 'Psychological / emotional' },
  { key: 'FINANCIAL', label: 'Financial or material' },
  { key: 'MODERN_SLAVERY', label: 'Modern slavery' },
  { key: 'DISCRIMINATORY', label: 'Discriminatory' },
  { key: 'ORGANISATIONAL', label: 'Organisational' },
  { key: 'NEGLECT', label: 'Neglect / acts of omission' },
  { key: 'SELF_NEGLECT', label: 'Self-neglect' },
];

export const SOURCES: { key: string; label: string }[] = [
  { key: 'CARER', label: 'A carer' },
  { key: 'FAMILY', label: 'Family or friend' },
  { key: 'CLIENT', label: 'The person themselves' },
  { key: 'PROFESSIONAL', label: 'Another professional' },
  { key: 'ANONYMOUS', label: 'Anonymous' },
  { key: 'OFFICE', label: 'Office staff' },
  { key: 'OTHER', label: 'Other' },
];

export type ConcernStatus = 'OPEN' | 'INVESTIGATING' | 'REFERRED' | 'CLOSED';

export interface ConcernSummary {
  id: string;
  serviceUserId: string | null;
  personAtRisk: string | null;
  source: string;
  raisedByName: string | null;
  occurredAt: string | null;
  raisedAt: string;
  harmTypes: string; // JSON array
  description: string;
  status: ConcernStatus;
  referredToLA: boolean;
  laReference: string | null;
  cqcNotified: boolean;
  policeInformed: boolean;
  closedAt: string | null;
  createdAt: string;
  raisedBy?: { id: string; firstName: string; lastName: string } | null;
  serviceUser?: { id: string; firstName: string; lastName: string } | null;
  staffInvolved?: { id: string; firstName: string; lastName: string } | null;
}

export interface Concern extends ConcernSummary {
  immediateAction: string | null;
  laName: string | null;
  laReferralDate: string | null;
  cqcNotifiedDate: string | null;
  cqcReference: string | null;
  policeReference: string | null;
  outcome: string | null;
  lessonsLearned: string | null;
  attachments: string;
  updatedAt: string;
  closedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface ConcernDraft {
  serviceUserId?: string | null;
  personAtRisk?: string | null;
  raisedByName?: string | null;
  source?: string;
  occurredAt?: string | null;
  harmTypes?: string[];
  description?: string;
  immediateAction?: string | null;
  staffInvolvedId?: string | null;
}

export interface ConcernPatch extends ConcernDraft {
  status?: ConcernStatus;
  referredToLA?: boolean;
  laName?: string | null;
  laReference?: string | null;
  laReferralDate?: string | null;
  cqcNotified?: boolean;
  cqcNotifiedDate?: string | null;
  cqcReference?: string | null;
  policeInformed?: boolean;
  policeReference?: string | null;
  outcome?: string | null;
  lessonsLearned?: string | null;
}

export function parseHarm(json?: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const harmLabel = (key: string) => HARM_TYPES.find((h) => h.key === key)?.label || key;
export const sourceLabel = (key: string) => SOURCES.find((s) => s.key === key)?.label || key;

export const safeguardingApi = {
  list: (params?: { status?: ConcernStatus; open?: boolean }) =>
    api.get<ConcernSummary[]>('/safeguarding', { params }).then((r) => r.data),
  get: (id: string) => api.get<Concern>(`/safeguarding/${id}`).then((r) => r.data),
  create: (body: ConcernDraft) => api.post<ConcernSummary>('/safeguarding', body).then((r) => r.data),
  update: (id: string, body: ConcernPatch) =>
    api.patch<ConcernSummary>(`/safeguarding/${id}`, body).then((r) => r.data),
};
