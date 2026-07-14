import api from '../lib/axios';

export interface EligibleCarer {
  id: string; firstName: string; lastName: string; role: string;
}

export interface HandoverShift {
  id: string; date: string; startTime: string; endTime: string; visitName: string | null;
  serviceUser?: { id: string; firstName: string; lastName: string; site?: { name: string } | null } | null;
}

export interface Handover {
  id: string; shiftId: string; status: string; reason: string | null; createdAt: string; respondedAt: string | null;
  shift: HandoverShift;
  fromUser: { id: string; firstName: string; lastName: string };
  toUser: { id: string; firstName: string; lastName: string };
}

export const handoversApi = {
  eligible: (shiftId: string) =>
    api.get<EligibleCarer[]>('/handovers/eligible', { params: { shiftId } }).then((r) => r.data),
  mine: () =>
    api.get<{ incoming: Handover[]; outgoing: Handover[] }>('/handovers/mine').then((r) => r.data),
  request: (shiftId: string, toUserId: string, reason: string) =>
    api.post<Handover>('/handovers', { shiftId, toUserId, reason }).then((r) => r.data),
  respond: (id: string, action: 'ACCEPT' | 'DECLINE') =>
    api.post(`/handovers/${id}/respond`, { action }).then((r) => r.data),
  cancel: (id: string) =>
    api.post(`/handovers/${id}/cancel`).then((r) => r.data),
};
