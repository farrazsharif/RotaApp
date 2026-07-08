import api from '../lib/axios';

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
  active: boolean;
  plan: 'FLAT' | 'PER_SEAT';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  hasAccess: boolean;
  lapsed: boolean;
  staff: number;
  serviceUsers: number;
  createdAt: string;
}

export interface PlatformData {
  metrics: { total: number; trialing: number; active: number; lapsed: number };
  companies: PlatformCompany[];
}

export const platformApi = {
  list: (params?: { status?: string; q?: string }) =>
    api.get<PlatformData>('/platform/companies', { params }).then((r) => r.data),
  setActive: (id: string, active: boolean) =>
    api.post(`/platform/companies/${id}/active`, { active }).then((r) => r.data),
  extendTrial: (id: string, days: number) =>
    api.post(`/platform/companies/${id}/extend-trial`, { days }).then((r) => r.data),
  endTrial: (id: string) => api.post(`/platform/companies/${id}/end-trial`).then((r) => r.data),
  comp: (id: string) => api.post(`/platform/companies/${id}/comp`).then((r) => r.data),
};
