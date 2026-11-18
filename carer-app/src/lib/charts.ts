// The daily charts, as the carer app knows them.
//
// Its own copy of the vocabulary, the way clientSafety and the risk
// assessment schema are — the app ships separately and has to keep working
// offline, so it cannot reach for the portal's module. Keep the two in step:
// a key added here must be added in frontend/src/api/charts.ts too, or the
// office reads back a raw code where a label should be.

export type ChartKind = 'FLUID' | 'FOOD' | 'REPOSITION' | 'CONTINENCE' | 'SKIN';

export const CHART_KINDS: { key: ChartKind; label: string; verb: string; icon: string }[] = [
  { key: 'FLUID', label: 'Drink', verb: 'Record a drink', icon: '🥤' },
  { key: 'FOOD', label: 'Food', verb: 'Record a meal', icon: '🍽️' },
  { key: 'REPOSITION', label: 'Turn', verb: 'Record a reposition', icon: '🔄' },
  { key: 'CONTINENCE', label: 'Toilet', verb: 'Record continence', icon: '🚻' },
  { key: 'SKIN', label: 'Skin', verb: 'Record a skin check', icon: '🩹' },
];

// Common drink sizes, so the usual case is one tap rather than typing a
// number on a phone in someone's hallway.
export const FLUID_PRESETS: { ml: number; label: string }[] = [
  { ml: 100, label: 'Small glass' },
  { ml: 150, label: 'Cup of tea' },
  { ml: 200, label: 'Mug' },
  { ml: 250, label: 'Large glass' },
  { ml: 330, label: 'Can' },
  { ml: 500, label: 'Bottle' },
];

export const PORTIONS: { key: string; label: string }[] = [
  { key: 'NONE', label: 'None' },
  { key: 'QUARTER', label: '¼' },
  { key: 'HALF', label: '½' },
  { key: 'THREE_QUARTERS', label: '¾' },
  { key: 'ALL', label: 'All' },
];

export const POSITIONS: { key: string; label: string }[] = [
  { key: 'BACK', label: 'On back' },
  { key: 'LEFT', label: 'Left side' },
  { key: 'RIGHT', label: 'Right side' },
  { key: 'CHAIR', label: 'In chair' },
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

export const STOOL_SCALE: { value: number; label: string }[] = [
  { value: 1, label: '1 — separate hard lumps' },
  { value: 2, label: '2 — lumpy, sausage-like' },
  { value: 3, label: '3 — sausage with cracks' },
  { value: 4, label: '4 — smooth and soft' },
  { value: 5, label: '5 — soft blobs' },
  { value: 6, label: '6 — mushy, ragged edges' },
  { value: 7, label: '7 — entirely liquid' },
];

// `alarming` ones set the office flag server-side as well. Said plainly here
// so the carer sees why the app reacted.
export const SKIN_FINDINGS: { key: string; label: string; alarming?: boolean }[] = [
  { key: 'INTACT', label: 'Intact — nothing to report' },
  { key: 'RED_BLANCHING', label: 'Red, goes white when pressed' },
  { key: 'RED_NON_BLANCHING', label: 'Red, stays red when pressed', alarming: true },
  { key: 'BROKEN', label: 'Broken skin', alarming: true },
  { key: 'BLISTER', label: 'Blister', alarming: true },
  { key: 'BRUISE', label: 'Bruise' },
  { key: 'RASH', label: 'Rash' },
  { key: 'OTHER', label: 'Something else' },
];

export const BODY_SITES = [
  'Sacrum / bottom', 'Heel — left', 'Heel — right', 'Hip — left', 'Hip — right',
  'Buttock — left', 'Buttock — right', 'Ankle — left', 'Ankle — right',
  'Elbow — left', 'Elbow — right', 'Shoulder — left', 'Shoulder — right',
  'Back', 'Head', 'Ear — left', 'Ear — right', 'Knee — left', 'Knee — right',
  'Foot — left', 'Foot — right', 'Toes', 'Arm', 'Leg', 'Abdomen', 'Chest', 'Other',
];

export function parseCharts(json?: string | null): ChartKind[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x): x is ChartKind => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const chartMeta = (key: string) => CHART_KINDS.find((c) => c.key === key);
export const skinIsAlarming = (key?: string | null) =>
  !!SKIN_FINDINGS.find((s) => s.key === key)?.alarming;
