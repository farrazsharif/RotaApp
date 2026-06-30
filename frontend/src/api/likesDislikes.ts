import api from '../lib/axios';
import { LikesDislikes } from '../types';

export type LikesDislikesData = Partial<Omit<LikesDislikes, 'id' | 'serviceUserId' | 'updatedById' | 'createdAt' | 'updatedAt'>>;

export const likesDislikesApi = {
  // Returns null when nothing has been recorded yet.
  get: (serviceUserId: string) =>
    api.get<LikesDislikes | null>(`/likes-dislikes/${serviceUserId}`).then((r) => r.data),
  save: (serviceUserId: string, data: LikesDislikesData) =>
    api.put<LikesDislikes>(`/likes-dislikes/${serviceUserId}`, data).then((r) => r.data),
};
