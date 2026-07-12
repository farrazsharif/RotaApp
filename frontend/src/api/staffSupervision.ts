import api from '../lib/axios';

export interface Supervision {
  id: string;
  userId: string;
  date: string;
  nextReviewDate?: string | null;
  position?: string | null;
  answers: string; // JSON: { [questionKey]: 'YES' | 'NO' }
  serviceUsers?: string | null;
  observations: string; // JSON: { [obsKey]: string }
  assessorName?: string | null;
  assessorSignature?: string | null;
  staffSignature?: string | null;
  createdAt: string;
}

export interface SupervisionData {
  userId?: string;
  date: string;
  position?: string;
  answers?: string;
  serviceUsers?: string;
  observations?: string;
  assessorName?: string;
  assessorSignature?: string;
  staffSignature?: string;
}

export const staffSupervisionApi = {
  list: (userId: string) => api.get<Supervision[]>('/staff-supervision', { params: { userId } }).then((r) => r.data),
  get: (id: string) => api.get<Supervision>(`/staff-supervision/${id}`).then((r) => r.data),
  create: (data: SupervisionData) => api.post<Supervision>('/staff-supervision', data).then((r) => r.data),
  update: (id: string, data: Partial<SupervisionData>) => api.put<Supervision>(`/staff-supervision/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/staff-supervision/${id}`).then((r) => r.data),
};
