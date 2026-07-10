import api from '../lib/axios';

export interface OfficeNote {
  id: string;
  body: string;
  authorId?: string | null;
  authorName?: string | null;
  createdAt: string;
}

export const notesApi = {
  list: () => api.get<OfficeNote[]>('/notes').then((r) => r.data),
  create: (body: string) => api.post<OfficeNote>('/notes', { body }).then((r) => r.data),
  remove: (id: string) => api.delete(`/notes/${id}`).then((r) => r.data),
};
