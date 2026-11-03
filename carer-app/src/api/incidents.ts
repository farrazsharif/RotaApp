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
  status: string;
  closedAt: string | null;
  createdAt: string;
  reportedBy?: { id: string; firstName: string; lastName: string } | null;
  serviceUser?: { id: string; firstName: string; lastName: string } | null;
}

export interface NewIncident {
  serviceUserId?: string | null;
  shiftId?: string | null;
  occurredAt: string;
  kind: string;
  category?: string;
  whatHappened: string;
  injuries?: string;
  immediateAction?: string;
  whoInformed?: string;
  witnesses?: string;
  emergencyServices?: boolean;
}

export const incidentsApi = {
  // A carer's own reports — the server limits the list to theirs.
  mine: () => api.get<IncidentSummary[]>('/incidents', { params: { mine: true } }).then((r) => r.data),
  create: (body: NewIncident) => api.post<IncidentSummary>('/incidents', body).then((r) => r.data),
};
