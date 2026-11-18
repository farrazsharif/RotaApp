import api from '../lib/axios';
import type { ChartKind } from '../lib/charts';

export interface ChartEntry {
  id: string;
  serviceUserId: string;
  kind: ChartKind;
  shiftId: string | null;
  occurredAt: string;
  amountMl: number | null;
  portion: string | null;
  description: string | null;
  position: string | null;
  continence: string | null;
  incontinent: boolean;
  stoolScale: number | null;
  padChanged: boolean;
  bodySite: string | null;
  skinFinding: string | null;
  refused: boolean;
  concern: boolean;
  notes: string | null;
  createdAt: string;
  recordedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface ChartEntryInput {
  kind: ChartKind;
  occurredAt?: string;
  shiftId?: string | null;
  amountMl?: number | null;
  portion?: string | null;
  description?: string | null;
  position?: string | null;
  continence?: string | null;
  incontinent?: boolean;
  stoolScale?: number | null;
  padChanged?: boolean;
  bodySite?: string | null;
  skinFinding?: string | null;
  refused?: boolean;
  concern?: boolean;
  notes?: string | null;
}

export interface ChartDay {
  date: string;
  entries: ChartEntry[];
  totals: {
    fluidMl: number;
    fluidTargetMl: number | null;
    fluidShortfall: number | null;
    foodOffered: number;
    foodRefused: number;
    repositions: number;
    longestGapMins: number | null;
    repositionHours: number | null;
    continenceEpisodes: number;
    concerns: number;
  };
}

export const chartsApi = {
  day: (serviceUserId: string, date: string) =>
    api.get<ChartDay>(`/charts/${serviceUserId}/day`, { params: { date } }).then((r) => r.data),
  create: (serviceUserId: string, body: ChartEntryInput) =>
    api.post<ChartEntry>(`/charts/${serviceUserId}`, body).then((r) => r.data),
};
