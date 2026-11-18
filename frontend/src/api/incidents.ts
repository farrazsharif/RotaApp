import api from '../lib/axios';

export interface IncidentSummary {
  id: string;
  serviceUserId: string | null;
  shiftId: string | null;
  occurredAt: string;
  kind: string;
  category: string | null;
  whatHappened: string;
  injuries: string | null;
  emergencyServices: boolean;
  // Duty of candour (Reg 20). null on required means nobody has decided yet,
  // which is not the same as decided and not required.
  candourRequired: boolean | null;
  candourToldAt: string | null;
  candourWrittenAt: string | null;
  status: string;
  closedAt: string | null;
  createdAt: string;
  reportedBy?: { id: string; firstName: string; lastName: string } | null;
  serviceUser?: { id: string; firstName: string; lastName: string } | null;
}

export interface Incident extends IncidentSummary {
  immediateAction: string | null;
  whoInformed: string | null;
  witnesses: string | null;
  investigation: string; // JSON
  candourHarm: string | null;
  candourToldWho: string | null;
  candourApology: boolean;
  candourOutcomeAt: string | null;
  candourNotes: string | null;
  riddorRequired: boolean | null;
  riddorReportedAt: string | null;
  riddorRef: string | null;
  closedSignature: string | null;
  closedBy?: { id: string; firstName: string; lastName: string } | null;
  serviceUser?: { id: string; firstName: string; lastName: string; address?: string | null; postcode?: string | null } | null;
}

export interface IncidentPatch {
  investigation?: unknown;
  status?: 'REPORTED' | 'INVESTIGATING' | 'CLOSED';
  closedSignature?: string | null;
  kind?: string;
  category?: string | null;
  whatHappened?: string;
  injuries?: string | null;
  immediateAction?: string | null;
  whoInformed?: string | null;
  witnesses?: string | null;
  emergencyServices?: boolean;
  candourRequired?: boolean | null;
  candourHarm?: string | null;
  candourToldAt?: string | null;
  candourToldWho?: string | null;
  candourApology?: boolean;
  candourWrittenAt?: string | null;
  candourOutcomeAt?: string | null;
  candourNotes?: string | null;
  riddorRequired?: boolean | null;
  riddorReportedAt?: string | null;
  riddorRef?: string | null;
}

export const incidentsApi = {
  list: (params?: { status?: string; serviceUserId?: string }) =>
    api.get<IncidentSummary[]>('/incidents', { params }).then((r) => r.data),
  get: (id: string) => api.get<Incident>(`/incidents/${id}`).then((r) => r.data),
  update: (id: string, body: IncidentPatch) => api.patch<IncidentSummary>(`/incidents/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/incidents/${id}`).then((r) => r.data),
};
