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

/**
 * Closed = a record of something that happened, rather than a draft being
 * written. Signed by both people, or seeded from a signed form held on paper.
 *
 * Mirrors isClosed() in backend/src/controllers/staffSupervisionController.ts,
 * which is the one that actually enforces it. This copy only decides what the
 * screen offers, so the two must agree: a button that opens an editor the
 * server will refuse is worse than no button.
 */
export function isSupervisionClosed(s: {
  source?: string | null;
  assessorSignature?: string | null;
  staffSignature?: string | null;
}): boolean {
  if (s.source === 'paper') return true;
  return !!(s.assessorSignature && s.staffSignature);
}

export function parseMap(json?: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
