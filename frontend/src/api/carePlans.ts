import api from '../lib/axios';
import { CarePlan } from '../types';

export type CarePlanData = Partial<Omit<CarePlan, 'id' | 'serviceUserId' | 'updatedById' | 'createdAt' | 'updatedAt'>>;

export const carePlansApi = {
  // Returns null when no care plan has been written yet.
  get: (serviceUserId: string) =>
    api.get<CarePlan | null>(`/care-plans/${serviceUserId}`).then((r) => r.data),
  save: (serviceUserId: string, data: CarePlanData) =>
    api.put<CarePlan>(`/care-plans/${serviceUserId}`, data).then((r) => r.data),
};
