import api from '../lib/axios';
import { Review, ReviewOutcome, ReviewType } from '../types';

export interface ReviewData {
  serviceUserId: string;
  type?: ReviewType;
  reviewDate: string;
  nextReviewDate?: string | null;
  assessorName?: string;
  answers?: Record<string, { answer: string; comment: string }>;
  otherInfo?: string;
  outcomes?: ReviewOutcome[];
  representativeName?: string;
  phoneConsent?: boolean;
}

export const reviewsApi = {
  list: (serviceUserId?: string) =>
    api.get<Review[]>('/reviews', { params: serviceUserId ? { serviceUserId } : undefined }).then((r) => r.data),
  get: (id: string) => api.get<Review>(`/reviews/${id}`).then((r) => r.data),
  create: (data: ReviewData) => api.post<Review>('/reviews', data).then((r) => r.data),
  update: (id: string, data: Partial<ReviewData>) => api.put<Review>(`/reviews/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/reviews/${id}`).then((r) => r.data),
};
