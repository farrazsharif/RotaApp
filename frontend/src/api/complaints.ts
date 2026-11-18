import api from '../lib/axios';

// What the complaint is about. One complaint often spans several, and these
// are what make a trend report possible: "six missed visits this quarter, all
// on the same run" is a finding; "six complaints" is not.
export const COMPLAINT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'CARE_QUALITY', label: 'Quality of care' },
  { key: 'MISSED_VISIT', label: 'Missed visit' },
  { key: 'LATE_VISIT', label: 'Late visit' },
  { key: 'CONTINUITY', label: 'Different carer each time' },
  { key: 'STAFF_CONDUCT', label: 'Staff conduct or attitude' },
  { key: 'COMMUNICATION', label: 'Communication' },
  { key: 'MEDICATION', label: 'Medication' },
  { key: 'MOVING_HANDLING', label: 'Moving & handling' },
  { key: 'PROPERTY', label: 'Property damage or loss' },
  { key: 'INVOICING', label: 'Invoicing or charges' },
  { key: 'EQUALITY', label: 'Discrimination' },
  { key: 'SAFEGUARDING', label: 'Safeguarding' },
  { key: 'OTHER', label: 'Other' },
];

export const RELATIONSHIPS: { key: string; label: string }[] = [
  { key: 'CLIENT', label: 'The person themselves' },
  { key: 'FAMILY', label: 'Family or friend' },
  { key: 'ADVOCATE', label: 'Advocate' },
  { key: 'STAFF', label: 'A member of staff' },
  { key: 'PROFESSIONAL', label: 'Another professional' },
  { key: 'COMMISSIONER', label: 'Commissioner / local authority' },
  { key: 'PUBLIC', label: 'Member of the public' },
  { key: 'ANONYMOUS', label: 'Anonymous' },
  { key: 'OTHER', label: 'Other' },
];

export const CHANNELS: { key: string; label: string }[] = [
  { key: 'PHONE', label: 'Phone' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'LETTER', label: 'Letter' },
  { key: 'IN_PERSON', label: 'In person' },
  { key: 'WEBSITE', label: 'Website' },
  { key: 'SURVEY', label: 'Survey' },
  { key: 'OTHER', label: 'Other' },
];

export const OUTCOMES: { key: string; label: string }[] = [
  { key: 'UPHELD', label: 'Upheld' },
  { key: 'PARTLY_UPHELD', label: 'Partly upheld' },
  { key: 'NOT_UPHELD', label: 'Not upheld' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
];

// Where the person has a right to take it further, so signposting to the
// Ombudsman matters most.
export const ESCALATABLE = ['NOT_UPHELD', 'PARTLY_UPHELD'];

export type ComplaintStatus = 'OPEN' | 'INVESTIGATING' | 'RESPONDED' | 'CLOSED';
// A compliment shares the record. It is received and logged identically; the
// only difference is that there is nothing to investigate.
export type ComplaintKind = 'COMPLAINT' | 'COMPLIMENT';

export interface ComplaintSummary {
  id: string;
  kind: ComplaintKind;
  reference: string | null;
  serviceUserId: string | null;
  complainantName: string | null;
  relationship: string;
  channel: string;
  receivedAt: string;
  occurredAt: string | null;
  categories: string; // JSON array
  summary: string;
  acknowledgedAt: string | null;
  outcome: string | null;
  respondedAt: string | null;
  ombudsmanSignposted: boolean;
  escalatedToOmbudsman: boolean;
  status: ComplaintStatus;
  closedAt: string | null;
  createdAt: string;
  receivedBy?: { id: string; firstName: string; lastName: string } | null;
  serviceUser?: { id: string; firstName: string; lastName: string } | null;
  staffInvolved?: { id: string; firstName: string; lastName: string } | null;
}

export interface Complaint extends ComplaintSummary {
  complainantContact: string | null;
  investigation: string | null;
  actionsTaken: string | null;
  lessonsLearned: string | null;
  ombudsmanReference: string | null;
  attachments: string;
  updatedAt: string;
  closedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface ComplaintInput {
  kind?: ComplaintKind;
  reference?: string | null;
  serviceUserId?: string | null;
  staffInvolvedId?: string | null;
  complainantName?: string | null;
  complainantContact?: string | null;
  relationship?: string;
  channel?: string;
  receivedAt?: string | null;
  occurredAt?: string | null;
  categories?: string[];
  summary?: string;
  acknowledgedAt?: string | null;
  investigation?: string | null;
  outcome?: string | null;
  respondedAt?: string | null;
  actionsTaken?: string | null;
  lessonsLearned?: string | null;
  ombudsmanSignposted?: boolean;
  escalatedToOmbudsman?: boolean;
  ombudsmanReference?: string | null;
  status?: ComplaintStatus;
}

export function parseCategories(json?: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const categoryLabel = (key: string) =>
  COMPLAINT_CATEGORIES.find((c) => c.key === key)?.label || key;
export const outcomeLabel = (key?: string | null) =>
  OUTCOMES.find((o) => o.key === key)?.label || null;
export const channelLabel = (key: string) => CHANNELS.find((c) => c.key === key)?.label || key;
export const relationshipLabel = (key: string) =>
  RELATIONSHIPS.find((r) => r.key === key)?.label || key;

export const complaintsApi = {
  list: (params?: { kind?: ComplaintKind; status?: string; open?: boolean; serviceUserId?: string }) =>
    api.get<ComplaintSummary[]>('/complaints', { params }).then((r) => r.data),
  get: (id: string) => api.get<Complaint>(`/complaints/${id}`).then((r) => r.data),
  create: (body: ComplaintInput) => api.post<ComplaintSummary>('/complaints', body).then((r) => r.data),
  update: (id: string, body: ComplaintInput) =>
    api.patch<ComplaintSummary>(`/complaints/${id}`, body).then((r) => r.data),
};
