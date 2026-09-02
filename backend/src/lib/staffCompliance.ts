// Staff-file compliance — the checklist that decides whether a staff member's
// personnel file is "complete" for CQC purposes. The defaults are modelled on
// the eight categories of information required by Schedule 3 of the Health and
// Social Care Act 2008 (Regulated Activities) Regulations 2014 (Regulation 19 —
// fit and proper persons employed), mapped onto the records the app holds:
// uploaded Documents (by category), Training records, the Fit for Work
// declaration, the staff photo and the emergency contact.
//
// The list is EDITABLE per company (OrgSettings.staffFileRequirements) — the
// office can relabel items, turn ones off, change how many references are
// needed, and add their own document requirements. This module is the single
// source of truth: both compliance endpoints evaluate against it, and the
// stored config is parsed/normalised here so the two can never drift.

// How a requirement is satisfied. The built-in types map to app-native records;
// 'document' checks for uploaded documents of a chosen category.
export type RequirementType =
  | 'identity' | 'dbs' | 'references' | 'rightToWork' | 'contract'
  | 'training' | 'fitForWork' | 'emergencyContact' | 'document';

export interface Requirement {
  id: string;
  label: string;
  hint: string;
  type: RequirementType;
  required: boolean; // false = not counted (kept for easy re-enable)
  category?: string; // document category (for type 'document', and reference/training overrides)
  minCount?: number; // how many of that document are needed (references / document)
  tab?: string; // staff-file tab to fix it in (frontend deep-link)
}

export interface ComplianceInput {
  photo?: string | null;
  fitForWork?: unknown; // JSON blob { signedName, signedDate, ... } or null
  emergencyContactName?: string | null;
  docCounts: Record<string, number>; // document category -> number held
  trainingCount: number; // number of training records held
}

export interface ComplianceItem {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  tab?: string;
}

export interface ComplianceResult {
  items: ComplianceItem[];
  missing: string[]; // labels of the items not yet satisfied
  total: number;
  present: number;
  complete: boolean;
}

export const RequirementTypes: RequirementType[] = [
  'identity', 'dbs', 'references', 'rightToWork', 'contract',
  'training', 'fitForWork', 'emergencyContact', 'document',
];

// The document categories the Documents tab offers for staff (USER owner).
export const USER_DOC_CATEGORIES = [
  'DBS Certificate', 'Contract', 'Reference', 'Right to Work',
  'Training Certificate', 'ID / Passport', 'Fit for Work', 'Other',
];

export const DEFAULT_REQUIREMENTS: Requirement[] = [
  { id: 'identity', label: 'Proof of identity', type: 'identity', required: true, tab: 'Documents',
    hint: 'Add a profile photo, or upload an ID / Passport document.' },
  { id: 'dbs', label: 'DBS certificate', type: 'dbs', required: true, tab: 'Documents',
    hint: 'Upload the DBS certificate in Documents.' },
  { id: 'references', label: 'Reference(s)', type: 'references', required: true, minCount: 1, tab: 'Documents',
    hint: 'Upload the required number of references in Documents.' },
  { id: 'rightToWork', label: 'Right to work', type: 'rightToWork', required: true, tab: 'Documents',
    hint: 'Upload right-to-work evidence (passport / visa / share code) in Documents.' },
  { id: 'contract', label: 'Employment contract', type: 'contract', required: true, tab: 'Documents',
    hint: 'Upload the signed contract of employment in Documents.' },
  { id: 'training', label: 'Qualifications / training', type: 'training', required: true, tab: 'Training',
    hint: 'Add a training record, or upload a training certificate in Documents.' },
  { id: 'fitForWork', label: 'Fit for work declaration', type: 'fitForWork', required: true, tab: 'Fit for Work',
    hint: 'Complete and sign the Fit for Work declaration, or upload the signed form.' },
  { id: 'emergencyContact', label: 'Emergency contact', type: 'emergencyContact', required: true, tab: 'Emergency Contact',
    hint: 'Record a next-of-kin / emergency contact name on the Emergency Contact tab.' },
];

// True when the Fit for Work declaration has actually been signed off (a blank
// object saved by opening the tab shouldn't count).
function fitForWorkSigned(f: unknown): boolean {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  return !!(o.signedName && String(o.signedName).trim()) && !!(o.signedDate && String(o.signedDate).trim());
}

function docCount(i: ComplianceInput, category: string): number {
  return i.docCounts[category] || 0;
}

// Evaluates a single requirement against a staff member's records.
function satisfied(req: Requirement, i: ComplianceInput): boolean {
  const min = Math.max(1, req.minCount || 1);
  switch (req.type) {
    case 'identity': return !!(i.photo && i.photo.trim()) || docCount(i, 'ID / Passport') > 0;
    case 'dbs': return docCount(i, 'DBS Certificate') > 0;
    case 'references': return docCount(i, req.category || 'Reference') >= min;
    case 'rightToWork': return docCount(i, 'Right to Work') > 0;
    case 'contract': return docCount(i, 'Contract') > 0;
    case 'training': return i.trainingCount > 0 || docCount(i, 'Training Certificate') > 0;
    case 'fitForWork': return fitForWorkSigned(i.fitForWork) || docCount(i, 'Fit for Work') > 0;
    case 'emergencyContact': return !!(i.emergencyContactName && i.emergencyContactName.trim());
    case 'document': return docCount(i, req.category || '') >= min;
    default: return false;
  }
}

// Parse and normalise the stored JSON config. Empty / invalid / no valid rows
// falls back to the built-in defaults, so a company that never touched Settings
// still gets the full CQC checklist.
export function parseRequirements(raw: string | null | undefined): Requirement[] {
  if (!raw) return DEFAULT_REQUIREMENTS;
  let arr: unknown = raw;
  try { arr = JSON.parse(raw); } catch { return DEFAULT_REQUIREMENTS; }
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_REQUIREMENTS;
  const clean = normaliseRequirements(arr);
  return clean.length ? clean : DEFAULT_REQUIREMENTS;
}

// Cleans an arbitrary array into valid Requirement rows (used on save and read).
export function normaliseRequirements(arr: unknown[]): Requirement[] {
  return arr
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r, idx): Requirement | null => {
      const type = String(r.type || '') as RequirementType;
      if (!RequirementTypes.includes(type)) return null;
      const label = String(r.label || '').trim();
      if (!label) return null;
      // A 'document' requirement is meaningless without a category.
      const category = r.category ? String(r.category).trim().slice(0, 60) : undefined;
      if (type === 'document' && !category) return null;
      const minRaw = Number(r.minCount);
      const minCount = Number.isFinite(minRaw) && minRaw > 0 ? Math.min(20, Math.round(minRaw)) : undefined;
      return {
        id: String(r.id || `req-${idx}`).slice(0, 60),
        label: label.slice(0, 80),
        hint: String(r.hint || '').trim().slice(0, 200),
        type,
        required: r.required !== false,
        ...(category ? { category } : {}),
        ...(minCount ? { minCount } : {}),
        tab: r.tab ? String(r.tab).slice(0, 40) : (type === 'document' ? 'Documents' : undefined),
      };
    })
    .filter((r): r is Requirement => r !== null)
    .slice(0, 40);
}

export function evaluateCompliance(input: ComplianceInput, requirements: Requirement[] = DEFAULT_REQUIREMENTS): ComplianceResult {
  const active = requirements.filter((r) => r.required);
  const items: ComplianceItem[] = active.map((r) => ({
    id: r.id,
    label: r.label,
    hint: r.hint,
    tab: r.tab,
    ok: satisfied(r, input),
  }));
  const missing = items.filter((i) => !i.ok).map((i) => i.label);
  const present = items.length - missing.length;
  return { items, missing, total: items.length, present, complete: missing.length === 0 };
}
