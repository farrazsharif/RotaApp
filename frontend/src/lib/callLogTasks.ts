// Shared task-checklist config + note generator for call logs.
//
// A carer ticks the common things they did on a visit (personal care, breakfast,
// a cup of tea, a chat…) and the visit note writes itself from those ticks, so
// the carer barely has to type. The office configures the task list once in
// Settings; each ticked task is also stored structured on the log for reporting.
//
// IMPORTANT: keep this file byte-for-byte identical to frontend/src/lib/callLogTasks.ts.

// A task the office offers on the checklist.
export interface CallLogTaskDef {
  id: string; // stable key
  label: string; // chip text, e.g. "Breakfast"
  phrase?: string; // "done" wording for the auto-note, e.g. "Prepared breakfast" (defaults to label)
  detail?: boolean; // if true, offer an optional free-text detail (e.g. what they ate)
}

// A task the carer actually ticked on a visit — snapshotted onto the log so it
// still reads correctly even if the office later edits the checklist.
export interface CallLogTaskTick {
  id: string;
  label: string;
  phrase?: string;
  detail?: string; // optional free text the carer added
  refused?: boolean; // task was offered but declined
}

// Sensible starter checklist. Used whenever the company hasn't customised its
// own list yet, so the feature works on day one.
export const DEFAULT_CALL_LOG_TASKS: CallLogTaskDef[] = [
  { id: 'personal-care', label: 'Personal care', phrase: 'Assisted with personal care' },
  { id: 'wash-dress', label: 'Wash & dress', phrase: 'Supported to wash and dress' },
  { id: 'shower', label: 'Shower / bath', phrase: 'Supported with a shower or bath' },
  { id: 'toileting', label: 'Toileting / continence', phrase: 'Supported with toileting' },
  { id: 'repositioned', label: 'Repositioned', phrase: 'Repositioned for comfort' },
  { id: 'medication', label: 'Medication', phrase: 'Supported with medication' },
  { id: 'breakfast', label: 'Breakfast', phrase: 'Prepared breakfast', detail: true },
  { id: 'lunch', label: 'Lunch', phrase: 'Prepared lunch', detail: true },
  { id: 'dinner', label: 'Dinner', phrase: 'Prepared dinner', detail: true },
  { id: 'snack', label: 'Snack', phrase: 'Gave a snack', detail: true },
  { id: 'drink', label: 'Hot drink', phrase: 'Made a hot drink', detail: true },
  { id: 'fluids', label: 'Fluids / hydration', phrase: 'Encouraged fluids', detail: true },
  { id: 'mobility', label: 'Mobility support', phrase: 'Supported with mobility' },
  { id: 'companionship', label: 'Companionship / chat', phrase: 'Spent time chatting' },
  { id: 'housework', label: 'Light housework', phrase: 'Helped with light housework', detail: true },
  { id: 'laundry', label: 'Laundry', phrase: 'Did the laundry' },
  { id: 'shopping', label: 'Shopping / errands', phrase: 'Helped with shopping', detail: true },
  { id: 'pet-care', label: 'Pet care', phrase: 'Helped with pet care' },
];

// Parse the stored JSON config into a usable list, falling back to the default
// checklist when the company hasn't set one (or the value is invalid).
export function resolveCallLogTasks(raw: string | null | undefined): CallLogTaskDef[] {
  if (!raw) return DEFAULT_CALL_LOG_TASKS;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length === 0) return DEFAULT_CALL_LOG_TASKS;
    const clean = v
      .filter((t) => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.label === 'string')
      .map((t) => ({
        id: String(t.id),
        label: String(t.label),
        phrase: t.phrase ? String(t.phrase) : undefined,
        detail: !!t.detail,
      }));
    return clean.length ? clean : DEFAULT_CALL_LOG_TASKS;
  } catch {
    return DEFAULT_CALL_LOG_TASKS;
  }
}

// Parse the ticks stored on a log (used by carer history + office views).
export function parseCallLogTicks(raw: string | null | undefined): CallLogTaskTick[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as CallLogTaskTick[]).filter((t) => t && typeof t.id === 'string') : [];
  } catch {
    return [];
  }
}

// Turn a set of ticked tasks into a readable visit note. Deterministic so the
// generated portion can be recognised and stripped when a log is re-opened for
// editing. Done tasks first, then anything declined.
export function buildNoteFromTicks(ticks: CallLogTaskTick[]): string {
  const sentences: string[] = [];
  for (const t of ticks.filter((x) => !x.refused)) {
    const base = (t.phrase || t.label).trim();
    if (!base) continue;
    const detail = t.detail?.trim();
    sentences.push(detail ? `${base} — ${detail}.` : `${base}.`);
  }
  for (const t of ticks.filter((x) => x.refused)) {
    const noun = (t.label || '').trim().toLowerCase();
    if (!noun) continue;
    const detail = t.detail?.trim();
    sentences.push(detail ? `Declined ${noun} — ${detail}.` : `Declined ${noun}.`);
  }
  return sentences.join(' ');
}
