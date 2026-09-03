// The editable list of training courses offered in the Training tab's dropdown.
// Stored per company in OrgSettings.trainingCourses (JSON string[]). An empty
// stored value falls back to these built-in defaults.

export const DEFAULT_TRAINING_COURSES = [
  'First Aid', 'Safeguarding Adults e-learning', 'Safeguarding Children',
  'Manual Handling', 'Infection Control', 'Medication Administration',
  'Health & Safety', 'Fire Safety', 'Food Hygiene', 'GDPR / Data Protection',
  'Equality & Diversity', 'Dementia Care', 'Other',
];

// Resolve the stored JSON string into a course list: empty / invalid falls back
// to the built-in defaults.
export function resolveTrainingCourses(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_TRAINING_COURSES;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch { /* fall through */ }
  return DEFAULT_TRAINING_COURSES;
}
