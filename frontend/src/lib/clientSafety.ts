// The three client-safety fields the CQC gap list called out, and the one rule
// that governs all of them: a blank is "nobody has asked", not "nothing to
// record". So every display distinguishes the two, and "None known" is a value
// somebody actively chose rather than the absence of one.

export const DNACPR_OPTIONS: { key: string; label: string }[] = [
  { key: 'NONE', label: 'No DNACPR or ReSPECT in place' },
  { key: 'DNACPR', label: 'DNACPR in place' },
  { key: 'RESPECT', label: 'ReSPECT form in place' },
];

// Accessible Information Standard: how this person needs information given to
// them. A fixed list because the Standard names these, with a free-text note
// for anything it misses.
export const COMMUNICATION_NEEDS: { key: string; label: string }[] = [
  { key: 'LARGE_PRINT', label: 'Large print' },
  { key: 'EASY_READ', label: 'Easy read' },
  { key: 'BRAILLE', label: 'Braille' },
  { key: 'BSL', label: 'BSL interpreter' },
  { key: 'INTERPRETER', label: 'Language interpreter' },
  { key: 'HEARING_LOOP', label: 'Hearing loop' },
  { key: 'HEARING_AID', label: 'Wears a hearing aid' },
  { key: 'VISUAL_IMPAIRMENT', label: 'Visual impairment' },
  { key: 'GLASSES', label: 'Wears glasses' },
  { key: 'SPEAK_SLOWLY', label: 'Speak slowly, allow time' },
  { key: 'ADVOCATE', label: 'Has an advocate' },
];

export const NONE_KNOWN = 'None known';

export const dnacprLabel = (key?: string | null) =>
  DNACPR_OPTIONS.find((d) => d.key === key)?.label || null;

export const commsLabel = (key: string) =>
  COMMUNICATION_NEEDS.find((c) => c.key === key)?.label || key;

export function parseComms(json?: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Whether an allergy record says anything at all. Used so a blank reads as a
// warning rather than as reassurance.
export const allergyRecorded = (v?: string | null) => !!(v && v.trim());
export const hasAllergies = (v?: string | null) =>
  allergyRecorded(v) && v!.trim().toLowerCase() !== NONE_KNOWN.toLowerCase();
