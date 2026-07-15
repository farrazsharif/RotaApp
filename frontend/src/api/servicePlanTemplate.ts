import api from '../lib/axios';
import { PspTemplate } from '../lib/servicePlanSchema';

interface TemplateResponse {
  sections: PspTemplate | null; // null = no company customisation (use default)
  updatedAt?: string;
}

export const servicePlanTemplateApi = {
  get: () => api.get<TemplateResponse>('/service-plan-template').then((r) => r.data),
  save: (sections: PspTemplate) =>
    api.put<TemplateResponse>('/service-plan-template', { sections }).then((r) => r.data),
  reset: () => api.delete<TemplateResponse>('/service-plan-template').then((r) => r.data),
};
