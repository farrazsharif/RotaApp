import api from '../lib/axios';

export interface PersonalServicePlan {
  id: string;
  serviceUserId: string;
  data: string; // JSON string of values
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export const servicePlansApi = {
  get: (serviceUserId: string) =>
    api.get<PersonalServicePlan | null>(`/service-plans/${serviceUserId}`).then((r) => r.data),
  save: (serviceUserId: string, data: Record<string, unknown>) =>
    api.put<PersonalServicePlan>(`/service-plans/${serviceUserId}`, { data: JSON.stringify(data) }).then((r) => r.data),
};
