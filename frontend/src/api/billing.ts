import api from '../lib/axios';

export interface BillingStatus {
  configured: boolean;
  plan: 'FLAT' | 'PER_SEAT';
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  hasAccess: boolean;
  seats: number;
  hasSubscription: boolean;
}

export const billingApi = {
  status: () => api.get<BillingStatus>('/billing/status').then((r) => r.data),
  checkout: (plan: 'FLAT' | 'PER_SEAT') =>
    api.post<{ url: string }>('/billing/checkout', { plan }).then((r) => r.data),
  portal: () => api.post<{ url: string }>('/billing/portal').then((r) => r.data),
};
