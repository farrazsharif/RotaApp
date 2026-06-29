import api from '../lib/axios';
import type { CarePlan } from '../types';

export const carePlansApi = {
  get: (serviceUserId: string) => api.get<CarePlan | null>(`/family/care-plans/${serviceUserId}`).then((r) => r.data),
};
