// Per-service-user care tasks: things a carer must do on a visit, each assigned
// to a specific call (e.g. "Give shower" on the Morning Call) or to every visit.
// Stored as a JSON string on ServiceUser.careTasks. The carer app shows a call's
// tasks on that visit and lets the carer tick them off (the ticks ride on the
// existing CallLog.tasks checklist, so they persist + read back like any other).
//
// IMPORTANT: keep this file byte-for-byte identical to
// frontend/src/lib/careTasks.ts.

// A task a manager has set up for a client.
export interface CareTask {
  name: string;
  description?: string;
  // The call/visit name this task belongs to (matches Shift.visitName, e.g.
  // "Morning Call"). Empty/absent = the task applies to EVERY visit.
  visit?: string;
  // Optional "log wording": the exact sentence that goes in the visit note when
  // the carer marks this task done (e.g. "Assisted with a shower"). Blank = the
  // note falls back to a grouped "Completed this visit: <task name>" sentence.
  phrase?: string;
}

// Parse the stored JSON into a clean list. Tolerant of older {name, description}
// rows with no visit (they come back as all-visits tasks). Drops nameless rows.
export function parseCareTasks(raw?: string | null): CareTask[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((t) => t && typeof t === 'object' && typeof t.name === 'string' && t.name.trim())
      .map((t) => {
        const o: CareTask = { name: String(t.name).trim() };
        if (t.description && String(t.description).trim()) o.description = String(t.description).trim();
        if (t.visit && String(t.visit).trim()) o.visit = String(t.visit).trim();
        if (t.phrase && String(t.phrase).trim()) o.phrase = String(t.phrase).trim();
        return o;
      });
  } catch {
    return [];
  }
}

// Serialise for saving (trimmed, nameless rows dropped, unknown fields stripped).
export function serializeCareTasks(tasks: CareTask[]): string {
  const clean = tasks
    .map((t) => {
      const o: CareTask = { name: (t.name || '').trim() };
      if (t.description && t.description.trim()) o.description = t.description.trim();
      if (t.visit && t.visit.trim()) o.visit = t.visit.trim();
      if (t.phrase && t.phrase.trim()) o.phrase = t.phrase.trim();
      return o;
    })
    .filter((t) => t.name);
  return JSON.stringify(clean);
}

// Turn the care-task ticks on a visit into proper sentences for the visit note.
// A done task with a manager-written `phrase` reads that sentence verbatim;
// done tasks with no phrase are grouped ("Completed this visit: a, b."); tasks
// the carer marked not-required are grouped ("Not required this visit: x, y.").
export function buildCareTaskNote(ticks: { label: string; phrase?: string; refused?: boolean }[]): string {
  const lcFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const joinList = (items: string[]) => {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  };
  const ensureSentence = (s: string) => {
    const t = s.trim();
    if (!t) return '';
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?]$/.test(cap) ? cap : `${cap}.`;
  };
  const phrasedDone: string[] = [];
  const unphrasedDone: string[] = [];
  const notRequired: string[] = [];
  for (const t of ticks) {
    if (t.refused) { notRequired.push(t.label); continue; }
    const p = (t.phrase || '').trim();
    if (p) phrasedDone.push(ensureSentence(p));
    else unphrasedDone.push(t.label);
  }
  const out = [...phrasedDone];
  if (unphrasedDone.length) out.push(`Completed this visit: ${joinList(unphrasedDone.map(lcFirst))}.`);
  if (notRequired.length) out.push(`Not required this visit: ${joinList(notRequired.map(lcFirst))}.`);
  return out.join(' ');
}

// The tasks that apply to a given call/visit: an exact (case-insensitive) match
// on `visit`, PLUS any all-visits task (no visit set). Used by the carer app to
// show only the tasks relevant to the call being worked.
export function careTasksForVisit(tasks: CareTask[], visitName?: string | null): CareTask[] {
  const target = (visitName || '').trim().toLowerCase();
  return tasks.filter((t) => {
    const tv = (t.visit || '').trim().toLowerCase();
    return tv === '' || tv === target;
  });
}

// A stable id for a care task so its completion tick persists on the call log
// across re-opens. Derived from the visit + name (two tasks with the same name
// on the same call collapse to one tick, which is the sensible behaviour).
export function careTaskId(t: CareTask): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `care:${slug(t.visit || 'all')}:${slug(t.name)}`;
}

// Ordered "On visit" choices for the task editor: the client's own planned calls
// first (distinct, in order), then any standard presets they haven't used yet.
// Case-insensitive de-dupe; the "All visits" option is rendered separately.
export function visitChoices(plannedVisits: string[], presets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const n = (name || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  plannedVisits.forEach(add);
  presets.forEach(add);
  return out;
}
