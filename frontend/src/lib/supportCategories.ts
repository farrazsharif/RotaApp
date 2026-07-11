// CQC PIR support-reason categories. A service user can have several.
export const SUPPORT_CATEGORIES = [
  'Dementia',
  'People detained under the Mental Health Act',
  'Mental health needs',
  'Drug or alcohol misuse',
  'Eating disorders',
  'Sensory impairments',
  'Learning disabilities or autistic spectrum disorder',
  'Physical disabilities',
];

// Stored on the service user as a JSON string array; parse it back to labels.
export function parseCategories(json?: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
