import api from '../lib/axios';

export type ServiceUserNoteCategory = 'GENERAL' | 'COUNCIL' | 'SOCIAL_WORK' | 'SAFEGUARDING' | 'CONTACT';

export interface ServiceUserNote {
  id: string;
  serviceUserId: string;
  category: ServiceUserNoteCategory;
  body: string;
  pinned: boolean;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export const serviceUserNotesApi = {
  list: (serviceUserId: string) =>
    api.get<ServiceUserNote[]>('/service-user-notes', { params: { serviceUserId } }).then((r) => r.data),
  create: (body: { serviceUserId: string; category: ServiceUserNoteCategory; body: string; pinned?: boolean }) =>
    api.post<ServiceUserNote>('/service-user-notes', body).then((r) => r.data),
  update: (id: string, body: { category?: ServiceUserNoteCategory; body?: string; pinned?: boolean }) =>
    api.patch<ServiceUserNote>(`/service-user-notes/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/service-user-notes/${id}`).then((r) => r.data),
};
