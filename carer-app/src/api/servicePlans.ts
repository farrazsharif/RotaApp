import api from '../lib/axios';
import type { PersonalServicePlan } from '../types';

export const servicePlansApi = {
  // Returns null when no plan has been started yet.
  get: (serviceUserId: string) =>
    api.get<PersonalServicePlan | null>(`/service-plans/${serviceUserId}`).then((r) => r.data),
};
