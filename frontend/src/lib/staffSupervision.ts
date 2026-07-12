// The staff supervision form's questions (from the Care 24 Supervision Form).

// Service-detail yes/no questions.
export const SUPERVISION_QUESTIONS: { key: string; label: string }[] = [
  { key: 'medicine', label: 'Do you administer or assist with medicine?' },
  { key: 'domestic', label: 'Do you do domestic work where required?' },
  { key: 'shopping', label: 'Do you take clients out for shopping?' },
  { key: 'community', label: 'Do you take clients into the community?' },
  { key: 'food', label: 'Do you cook or serve food?' },
  { key: 'uniform', label: 'Do you always wear the uniform and badge at the workplace?' },
  { key: 'punctual', label: 'Do you always get to work on time?' },
];

// Open-ended observation prompts.
export const SUPERVISION_OBSERVATIONS: { key: string; label: string }[] = [
  { key: 'tasks', label: 'How does the staff member perform tasks (assist medicines, domestic, personal care, food cooking or serving)?' },
  { key: 'communication', label: 'How does the staff member communicate with the Service Users and with Office management?' },
  { key: 'training', label: 'What trainings has the staff member already attended, and what trainings do they need to perform better?' },
  { key: 'feedback', label: "What is the clients' feedback regarding the staff member's work performance and punctuality?" },
  { key: 'satisfaction', label: 'Is the staff member happy with the office management, salary, mileage and hours?' },
  { key: 'other', label: 'Any other discussions' },
];

export function parseMap(json?: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
