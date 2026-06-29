import api from '../lib/axios';
import type { CarePlan } from '../types';

export const carePlansApi = {
  // Returns null when no care plan has been written yet.
  get: (serviceUserId: string) =>
    api.get<CarePlan | null>(`/care-plans/${serviceUserId}`).then((r) => r.data),
};
