import api from '../lib/axios';

export interface Handover {
  id: string;
  shiftId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'REVERTED';
  reason: string | null;
  createdAt: string;
  respondedAt: string | null;
  shift: {
    id: string; date: string; startTime: string; endTime: string; visitName: string | null;
    serviceUser?: { id: string; firstName: string; lastName: string; site?: { name: string } | null } | null;
  };
  fromUser: { id: string; firstName: string; lastName: string };
  toUser: { id: string; firstName: string; lastName: string };
}

export const handoversApi = {
  list: () => api.get<Handover[]>('/handovers').then((r) => r.data),
  revert: (id: string) => api.post(`/handovers/${id}/revert`).then((r) => r.data),
};
