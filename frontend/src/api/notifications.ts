import api from '../lib/axios';
import { Notification } from '../types';

export const notificationsApi = {
  list: () => api.get<Notification[]>('/notifications').then((r) => r.data),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data),
  markRead: (id: string) => api.put(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/notifications/mark-all-read').then((r) => r.data),
};
