import api from '../lib/axios';

// Mental capacity (MCA 2005, Reg 11).
//
// Capacity is decision-specific: every record here is about ONE decision at
// one moment, never about a person in general.

export const CAPACITY_CATEGORIES: { key: string; label: string }[] = [
  { key: 'PERSONAL_CARE', label: 'Personal care' },
  { key: 'MEDICATION', label: 'Medication' },
  { key: 'FINANCES', label: 'Money and finances' },
  { key: 'ACCOMMODATION', label: 'Where to live' },
  { key: 'HEALTHCARE', label: 'Healthcare and treatment' },
  { key: 'CONTACT', label: 'Contact with others' },
  { key: 'SAFETY', label: 'Personal safety' },
  { key: 'TECHNOLOGY', label: 'Technology and monitoring' },
  { key: 'OTHER', label: 'Other' },
];

export const AUTHORITY_KINDS: { key: string; label: string; hint?: string }[] = [
  { key: 'LPA_HEALTH', label: 'LPA — health & welfare', hint: 'Only confers authority once registered with the Office of the Public Guardian.' },
  { key: 'LPA_PROPERTY', label: 'LPA — property & affairs' },
  { key: 'DEPUTY_HEALTH', label: 'Deputy — health & welfare' },
  { key: 'DEPUTY_PROPERTY', label: 'Deputy — property & affairs' },
  { key: 'APPOINTEE', label: 'DWP appointee', hint: 'Covers benefits only. Not authority over care decisions.' },
  { key: 'COURT_ORDER', label: 'Court of Protection order' },
  { key: 'ADRT', label: 'Advance decision to refuse treatment', hint: "The person's own decision — record where the document is kept." },
];

// The four-part functional test. Failing any ONE means the person cannot make
// this decision at this time.
export const FUNCTIONAL_TEST: { key: FunctionalKey; label: string }[] = [
  { key: 'canUnderstand', label: 'Understand the information relevant to the decision' },
  { key: 'canRetain', label: 'Retain it long enough to make the decision' },
  { key: 'canWeigh', label: 'Use or weigh it as part of making the decision' },
  { key: 'canCommunicate', label: 'Communicate their decision, by any means' },
];

export type FunctionalKey = 'canUnderstand' | 'canRetain' | 'canWeigh' | 'canCommunicate';
export type CapacityOutcome = 'HAS_CAPACITY' | 'LACKS_CAPACITY';

export interface CapacityAssessment {
  id: string;
  serviceUserId: string;
  decision: string;
  category: string;
  assessedAt: string;
  impairment: boolean;
  impairmentDetail: string | null;
  stepsTaken: string | null;
  bestTimeOfDay: string | null;
  communicationUsed: string | null;
  canUnderstand: boolean | null;
  canRetain: boolean | null;
  canWeigh: boolean | null;
  canCommunicate: boolean | null;
  evidence: string | null;
  outcome: CapacityOutcome | null;
  reviewDate: string | null;
  biOptions: string | null;
  biPersonsViews: string | null;
  biConsulted: string | null;
  biLeastRestrictive: string | null;
  biDecision: string | null;
  biDecidedAt: string | null;
  deprivationConcern: boolean;
  deprivationRaisedWith: string | null;
  deprivationRaisedAt: string | null;
  deprivationReference: string | null;
  createdAt: string;
  updatedAt: string;
  assessedBy?: { id: string; firstName: string; lastName: string } | null;
  biDecidedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface LegalAuthority {
  id: string;
  serviceUserId: string;
  kind: string;
  holderName: string | null;
  holderContact: string | null;
  registered: boolean;
  reference: string | null;
  evidenceSeen: boolean;
  evidenceSeenAt: string | null;
  scope: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  evidenceSeenBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface CapacityPatch {
  decision?: string;
  category?: string;
  assessedAt?: string | null;
  impairment?: boolean;
  impairmentDetail?: string | null;
  stepsTaken?: string | null;
  bestTimeOfDay?: string | null;
  communicationUsed?: string | null;
  canUnderstand?: boolean | null;
  canRetain?: boolean | null;
  canWeigh?: boolean | null;
  canCommunicate?: boolean | null;
  evidence?: string | null;
  outcome?: CapacityOutcome | null;
  reviewDate?: string | null;
  biOptions?: string | null;
  biPersonsViews?: string | null;
  biConsulted?: string | null;
  biLeastRestrictive?: string | null;
  biDecision?: string | null;
  biDecidedAt?: string | null;
  deprivationConcern?: boolean;
  deprivationRaisedWith?: string | null;
  deprivationRaisedAt?: string | null;
  deprivationReference?: string | null;
}

export interface AuthorityPatch {
  kind?: string;
  holderName?: string | null;
  holderContact?: string | null;
  registered?: boolean;
  reference?: string | null;
  evidenceSeen?: boolean;
  scope?: string | null;
  notes?: string | null;
  active?: boolean;
}

export const categoryLabel = (key: string) =>
  CAPACITY_CATEGORIES.find((c) => c.key === key)?.label || key;
export const authorityLabel = (key: string) =>
  AUTHORITY_KINDS.find((a) => a.key === key)?.label || key;

export const capacityApi = {
  forServiceUser: (serviceUserId: string) =>
    api
      .get<{ assessments: CapacityAssessment[]; authorities: LegalAuthority[] }>(`/capacity/${serviceUserId}`)
      .then((r) => r.data),
  createAssessment: (serviceUserId: string, body: { decision: string; category?: string }) =>
    api.post<CapacityAssessment>(`/capacity/${serviceUserId}`, body).then((r) => r.data),
  updateAssessment: (id: string, body: CapacityPatch) =>
    api.patch<CapacityAssessment>(`/capacity/assessment/${id}`, body).then((r) => r.data),
  deleteAssessment: (id: string) => api.delete(`/capacity/assessment/${id}`).then((r) => r.data),
  createAuthority: (serviceUserId: string, body: AuthorityPatch) =>
    api.post<LegalAuthority>(`/capacity/${serviceUserId}/authority`, body).then((r) => r.data),
  updateAuthority: (id: string, body: AuthorityPatch) =>
    api.patch<LegalAuthority>(`/capacity/authority/${id}`, body).then((r) => r.data),
  deleteAuthority: (id: string) => api.delete(`/capacity/authority/${id}`).then((r) => r.data),
};
