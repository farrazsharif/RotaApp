// The supported-living support domains (Care 24's list). Shared by the office
// support plan and the per-visit session log. Keep in sync with the portal copy.
export interface SupportDomain { key: string; label: string }

export const SUPPORT_DOMAINS: SupportDomain[] = [
  { key: 'budgeting', label: 'Budgeting & money' },
  { key: 'benefits', label: 'Benefits & claims' },
  { key: 'medication', label: 'Medication' },
  { key: 'cooking', label: 'Cooking & meal prep' },
  { key: 'cleaning', label: 'Cleaning & household' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'appointments', label: 'Appointments (managing & attending)' },
  { key: 'social', label: 'Social & community access' },
  { key: 'emotional', label: 'Emotional support' },
  { key: 'mentalHealth', label: 'Mental health' },
  { key: 'behaviour', label: 'Behaviour monitoring' },
  { key: 'deescalation', label: 'De-escalation' },
];

const LABEL_BY_KEY = new Map(SUPPORT_DOMAINS.map((d) => [d.key, d.label]));
export const domainLabel = (key: string): string => LABEL_BY_KEY.get(key) || key;

export function parseDomains(raw?: string | null): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : []; } catch { return []; }
}
