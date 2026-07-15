import api from '../lib/axios';

export interface Announcement {
  id: string;
  title: string | null;
  body: string;
  authorId: string | null;
  authorName: string;
  targetUserId: string | null;
  createdAt: string;
}

export const announcementsApi = {
  listAll: () => api.get<Announcement[]>('/announcements/all').then((r) => r.data),
  create: (data: { body: string; title?: string; targetUserId?: string }) =>
    api.post<Announcement>('/announcements', data).then((r) => r.data),
  remove: (id: string) => api.delete(`/announcements/${id}`).then((r) => r.data),
};
