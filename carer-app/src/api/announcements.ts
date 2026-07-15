import api from '../lib/axios';

export interface Announcement {
  id: string;
  title: string | null;
  body: string;
  authorName: string;
  targetUserId: string | null;
  createdAt: string;
}

export const announcementsApi = {
  list: () => api.get<Announcement[]>('/announcements').then((r) => r.data),
};
