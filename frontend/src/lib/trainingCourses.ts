// The editable list of training courses offered in the Training tab's dropdown.
// Stored per company in OrgSettings.trainingCourses (JSON string[]). An empty
// stored value falls back to these built-in defaults.

export const DEFAULT_TRAINING_COURSES = [
  'Induction Training', 'Moving & Handling', 'Medication', 'Safeguarding',
  'Food Hygiene', 'Dementia', 'Understand Your Role', 'Your Personal Development',
  'Duty of Care', 'Equality and Diversity', 'Work in a Person Centred Way',
  'Communication', 'Privacy and Dignity', 'Fire Safety', 'Awareness of mental health',
  'Health and Safety', 'Infection Prevention and Control', 'Peg Feed Training',
  'Care Certificate',
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
