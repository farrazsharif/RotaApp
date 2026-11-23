import api from '../lib/axios';

export type YesNoNa = 'YES' | 'NO' | 'NA' | '';

export interface SpotCheckRow {
  carerId: string;
  carerName: string;
  lastCheck: string | null;
  lastCheckId: string | null;
  observerName: string | null;
  concerns: number | null;
  nextDue: string | null;
  due: boolean;
  lastSource?: string | null; // 'form' | 'paper'
}

export interface RenewalItem { serviceUserId: string; serviceUserName: string; docType: string; dueDate: string; overdue: boolean }

// One outstanding thing, for one person. Clients and staff in the same shape,
// because the worklist shows them in one list.
export interface WorkItem {
  subjectId: string;
  subjectName: string;
  subjectType: 'CLIENT' | 'STAFF';
  kind: string;
  dueDate: string | null; // null when nothing was ever recorded
  overdue: boolean;
  never: boolean;
}

export interface SupervisionSummary {
  intervalMonths: number;
  supervisions: { dueCount: number };
  spotChecks: { dueCount: number; rows: SpotCheckRow[] };
  reviews: { dueCount: number; items: { id: string; serviceUserId: string; serviceUserName: string; dueDate: string; overdue: boolean }[] };
  risk: { dueCount: number; items: { serviceUserId: string; serviceUserName: string; dueDate: string; overdue: boolean }[] };
  renewals: { overdueCount: number; dueSoonCount: number; items: RenewalItem[] };
  worklist: WorkItem[];
}

export interface SpotCheck {
  id: string;
  carerId: string;
  serviceUserId?: string | null;
  date: string;
  time?: string | null;
  location?: string | null;
  answers: string; // JSON: { itemId: { answer, comment } }
  generalComments?: string | null;
  observerName?: string | null;
  observerSignature?: string | null;
  source?: string | null;
  createdAt: string;
  carer?: { firstName: string; lastName: string };
  serviceUser?: { firstName: string; lastName: string } | null;
}

export interface SpotCheckInput {
  carerId: string;
  serviceUserId?: string;
  date: string;
  time?: string;
  location?: string;
  answers: Record<string, { answer: YesNoNa; comment?: string }>;
  generalComments?: string;
  observerName?: string;
  observerSignature?: string;
  source?: string;
}

export const supervisionApi = {
  summary: () => api.get<SupervisionSummary>('/supervision/summary').then((r) => r.data),
  listSpotChecks: (carerId?: string) =>
    api.get<SpotCheck[]>('/supervision/spot-checks', { params: carerId ? { carerId } : {} }).then((r) => r.data),
  getSpotCheck: (id: string) => api.get<SpotCheck>(`/supervision/spot-checks/${id}`).then((r) => r.data),
  createSpotCheck: (data: SpotCheckInput) => api.post<SpotCheck>('/supervision/spot-checks', data).then((r) => r.data),
  updateSpotCheck: (id: string, data: SpotCheckInput) => api.put<SpotCheck>(`/supervision/spot-checks/${id}`, data).then((r) => r.data),
  deleteSpotCheck: (id: string) => api.delete(`/supervision/spot-checks/${id}`).then((r) => r.data),
};
