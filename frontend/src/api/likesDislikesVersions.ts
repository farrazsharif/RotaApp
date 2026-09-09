import api from '../lib/axios';

// Light metadata for the "Previous reviews" list.
export interface LikesDislikesVersionSummary {
  id: string;
  label: string | null;
  reviewDate: string | null;
  createdByName: string;
  createdAt: string;
}

// Full frozen snapshot of the Likes & Dislikes record for viewing/printing read-only.
export interface LikesDislikesVersionFull extends LikesDislikesVersionSummary {
  serviceUserId: string;
  data: Record<string, unknown>;
}

export const likesDislikesVersionsApi = {
  list: (serviceUserId: string) =>
    api.get<LikesDislikesVersionSummary[]>('/likes-dislikes-versions', { params: { serviceUserId } }).then((r) => r.data),
  get: (id: string) => api.get<LikesDislikesVersionFull>(`/likes-dislikes-versions/${id}`).then((r) => r.data),
  // The snapshot is built server-side from the stored record; the client only
  // supplies the client id and an optional review label.
  create: (body: { serviceUserId: string; label?: string }) =>
    api.post<LikesDislikesVersionSummary>('/likes-dislikes-versions', body).then((r) => r.data),
};
