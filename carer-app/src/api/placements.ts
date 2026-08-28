import api from '../lib/axios';

export interface PlacementClient {
  id: string;
  firstName: string;
  lastName: string;
  address?: string | null;
  postcode?: string | null;
  phone?: string | null;
}

export interface MyPlacement {
  id: string;
  serviceUserId: string;
  carerId: string;
  startDate: string;
  endDate: string;
  nightType: 'SLEEP_IN' | 'WAKING';
  status: string;
  note?: string | null;
  serviceUser: PlacementClient | null;
}

export interface LiveInLog {
  id: string;
  placementId: string;
  date: string;
  data: string; // JSON string
}

export const placementsApi = {
  mine: () => api.get<MyPlacement[]>('/placements/mine').then((r) => r.data),
  logs: (placementId: string) => api.get<LiveInLog[]>(`/placements/${placementId}/logs`).then((r) => r.data),
  saveLog: (placementId: string, date: string, data: Record<string, unknown>) =>
    api.put<LiveInLog>(`/placements/${placementId}/logs/${date}`, { data: JSON.stringify(data) }).then((r) => r.data),
};
