import api from '../lib/axios';

// The daily charts: food, fluid, repositioning, continence and skin.
//
// One shape for all five. Which fields matter is decided by `kind`, and the
// labels below are the vocabulary both the portal and the carer app use, so
// a chart reads the same wherever it is opened.

export type ChartKind = 'FLUID' | 'FOOD' | 'REPOSITION' | 'CONTINENCE' | 'SKIN';

export const CHART_KINDS: { key: ChartKind; label: string; short: string; hint: string }[] = [
  { key: 'FLUID', label: 'Food & fluid — drinks', short: 'Fluids', hint: 'Every drink, in millilitres, against a daily target.' },
  { key: 'FOOD', label: 'Food & fluid — meals', short: 'Food', hint: 'What was offered and how much was actually eaten.' },
  { key: 'REPOSITION', label: 'Repositioning', short: 'Turns', hint: 'For anyone at risk of pressure damage. Shows the gaps, not just the turns.' },
  { key: 'CONTINENCE', label: 'Continence & bowels', short: 'Continence', hint: 'Including the Bristol stool scale where a bowel movement is recorded.' },
  { key: 'SKIN', label: 'Skin checks', short: 'Skin', hint: 'Where on the body, what was seen, and what was done.' },
];

export const PORTIONS: { key: string; label: string }[] = [
  { key: 'NONE', label: 'None' },
  { key: 'QUARTER', label: 'A quarter' },
  { key: 'HALF', label: 'Half' },
  { key: 'THREE_QUARTERS', label: 'Three quarters' },
  { key: 'ALL', label: 'All of it' },
];

export const POSITIONS: { key: string; label: string }[] = [
  { key: 'BACK', label: 'On their back' },
  { key: 'LEFT', label: 'Left side' },
  { key: 'RIGHT', label: 'Right side' },
  { key: 'CHAIR', label: 'In a chair' },
  { key: 'STANDING', label: 'Standing' },
  { key: 'WALKING', label: 'Walking' },
  { key: 'OTHER', label: 'Other' },
];

export const CONTINENCE_TYPES: { key: string; label: string }[] = [
  { key: 'URINE', label: 'Passed urine' },
  { key: 'BOWEL', label: 'Bowels opened' },
  { key: 'BOTH', label: 'Both' },
  { key: 'NONE', label: 'Nothing passed' },
  { key: 'CATHETER', label: 'Catheter emptied' },
];

// The Bristol stool scale, in the words a carer can match to what they saw.
export const STOOL_SCALE: { value: number; label: string }[] = [
  { value: 1, label: '1 — separate hard lumps' },
  { value: 2, label: '2 — lumpy and sausage-like' },
  { value: 3, label: '3 — sausage with cracks' },
  { value: 4, label: '4 — smooth and soft' },
  { value: 5, label: '5 — soft blobs, clear edges' },
  { value: 6, label: '6 — mushy, ragged edges' },
  { value: 7, label: '7 — entirely liquid' },
];

export const SKIN_FINDINGS: { key: string; label: string; alarming?: boolean }[] = [
  { key: 'INTACT', label: 'Intact' },
  { key: 'RED_BLANCHING', label: 'Red, goes white when pressed' },
  { key: 'RED_NON_BLANCHING', label: 'Red, stays red when pressed', alarming: true },
  { key: 'BROKEN', label: 'Broken skin', alarming: true },
  { key: 'BLISTER', label: 'Blister', alarming: true },
  { key: 'BRUISE', label: 'Bruise' },
  { key: 'RASH', label: 'Rash' },
  { key: 'OTHER', label: 'Something else' },
];

// The body map, as a flat list. Deliberately words rather than a clickable
// diagram: a carer describing "left heel" is unambiguous, and a tap on a
// picture on a cracked phone screen in a dark hallway is not.
export const BODY_SITES = [
  'Head', 'Ear — left', 'Ear — right', 'Shoulder — left', 'Shoulder — right',
  'Elbow — left', 'Elbow — right', 'Back', 'Sacrum / bottom', 'Hip — left', 'Hip — right',
  'Buttock — left', 'Buttock — right', 'Knee — left', 'Knee — right',
  'Ankle — left', 'Ankle — right', 'Heel — left', 'Heel — right',
  'Foot — left', 'Foot — right', 'Toes', 'Arm', 'Leg', 'Abdomen', 'Chest', 'Other',
];

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
  client: {
    id: string;
    firstName: string;
    lastName: string;
    careCharts: string;
    fluidTargetMl: number | null;
    repositionHours: number | null;
  };
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

export function parseCharts(json?: string | null): ChartKind[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x): x is ChartKind => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const chartLabel = (key: string) => CHART_KINDS.find((c) => c.key === key)?.label || key;
export const chartShort = (key: string) => CHART_KINDS.find((c) => c.key === key)?.short || key;
export const portionLabel = (key?: string | null) => PORTIONS.find((p) => p.key === key)?.label || null;
export const positionLabel = (key?: string | null) => POSITIONS.find((p) => p.key === key)?.label || null;
export const continenceLabel = (key?: string | null) => CONTINENCE_TYPES.find((c) => c.key === key)?.label || null;
export const skinLabel = (key?: string | null) => SKIN_FINDINGS.find((s) => s.key === key)?.label || null;
export const skinIsAlarming = (key?: string | null) =>
  !!SKIN_FINDINGS.find((s) => s.key === key)?.alarming;

export const chartsApi = {
  day: (serviceUserId: string, date: string) =>
    api.get<ChartDay>(`/charts/${serviceUserId}/day`, { params: { date } }).then((r) => r.data),
  list: (serviceUserId: string, params?: { kind?: ChartKind; from?: string; to?: string }) =>
    api.get<ChartEntry[]>(`/charts/${serviceUserId}`, { params }).then((r) => r.data),
  create: (serviceUserId: string, body: ChartEntryInput) =>
    api.post<ChartEntry>(`/charts/${serviceUserId}`, body).then((r) => r.data),
  update: (id: string, body: Partial<ChartEntryInput>) =>
    api.patch<ChartEntry>(`/charts/entry/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/charts/entry/${id}`).then((r) => r.data),
};
