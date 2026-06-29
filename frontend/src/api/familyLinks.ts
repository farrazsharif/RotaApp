import api from '../lib/axios';
import { FamilyLink } from '../types';

export const familyLinksApi = {
  list: (serviceUserId?: string) =>
    api.get<FamilyLink[]>('/family-links', { params: { serviceUserId } }).then((r) => r.data),
  create: (data: { serviceUserId: string; email: string; firstName: string; lastName: string; relation?: string }) =>
    api.post<FamilyLink>('/family-links', data).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ message: string }>(`/family-links/${id}`).then((r) => r.data),
};
