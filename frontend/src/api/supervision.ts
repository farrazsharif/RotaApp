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
}

export interface SupervisionSummary {
  intervalMonths: number;
  supervisions: { dueCount: number };
  spotChecks: { dueCount: number; rows: SpotCheckRow[] };
  reviews: { dueCount: number; items: { id: string; serviceUserId: string; serviceUserName: string; dueDate: string; overdue: boolean }[] };
  risk: { dueCount: number; items: { serviceUserId: string; serviceUserName: string; dueDate: string; overdue: boolean }[] };
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
}

export const supervisionApi = {
  summary: () => api.get<SupervisionSummary>('/supervision/summary').then((r) => r.data),
  listSpotChecks: (carerId?: string) =>
    api.get<SpotCheck[]>('/supervision/spot-checks', { params: carerId ? { carerId } : {} }).then((r) => r.data),
  getSpotCheck: (id: string) => api.get<SpotCheck>(`/supervision/spot-checks/${id}`).then((r) => r.data),
  createSpotCheck: (data: SpotCheckInput) => api.post<SpotCheck>('/supervision/spot-checks', data).then((r) => r.data),
  deleteSpotCheck: (id: string) => api.delete(`/supervision/spot-checks/${id}`).then((r) => r.data),
};
