import api from '../lib/axios';
import { CarePlan } from '../types';

export type CarePlanData = Partial<Omit<CarePlan, 'id' | 'serviceUserId' | 'updatedById' | 'createdAt' | 'updatedAt'>>;

export interface CarePlanSummary {
  serviceUserId: string;
  createdAt: string;
  updatedAt: string;
}

export const carePlansApi = {
  list: () =>
    api.get<CarePlanSummary[]>('/care-plans').then((r) => r.data),
  // Returns null when no care plan has been written yet.
  get: (serviceUserId: string) =>
    api.get<CarePlan | null>(`/care-plans/${serviceUserId}`).then((r) => r.data),
  save: (serviceUserId: string, data: CarePlanData) =>
    api.put<CarePlan>(`/care-plans/${serviceUserId}`, data).then((r) => r.data),
  remove: (serviceUserId: string) =>
    api.delete(`/care-plans/${serviceUserId}`).then((r) => r.data),
};
