import api from '../lib/axios';

export const pushApi = {
  getVapidKey: () => api.get<{ publicKey: string | null }>('/push/vapid-key').then((r) => r.data.publicKey),
  subscribe: (sub: PushSubscriptionJSON) => api.post('/push/subscribe', sub).then((r) => r.data),
  unsubscribe: (endpoint: string) => api.post('/push/unsubscribe', { endpoint }).then((r) => r.data),
};
