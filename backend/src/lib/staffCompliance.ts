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

// Local (UK-based) vs Overseas (international recruitment) staff. Overseas staff
// carry extra right-to-work / sponsorship paperwork.
export type StaffType = 'LOCAL' | 'OVERSEAS';
export const StaffTypes: StaffType[] = ['LOCAL', 'OVERSEAS'];

// Which staff a requirement applies to: everyone, only local, or only overseas.
export type AppliesTo = 'ALL' | 'LOCAL' | 'OVERSEAS';
export const AppliesToValues: AppliesTo[] = ['ALL', 'LOCAL', 'OVERSEAS'];

export interface Requirement {
  id: string;
  label: string;
  hint: string;
  type: RequirementType;
  required: boolean; // false = not counted (kept for easy re-enable)
  appliesTo?: AppliesTo; // ALL (default) | LOCAL | OVERSEAS
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
  staffType: StaffType; // LOCAL | OVERSEAS — decides which requirements apply
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
// Row 2 is standard onboarding paperwork; row 3 is the extra documents held
// for overseas recruits.
export const USER_DOC_CATEGORIES = [
  'DBS Certificate', 'Contract', 'Reference', 'Right to Work',
  'Training Certificate', 'ID / Passport', 'Fit for Work',
  'Interview Questionnaire', 'Payroll Form', 'Staff Induction Confirmation', 'Consent to Hold DBS', 'Application Form', 'Shadowing Form', 'Induction Training', 'DBS ID Form', 'Lone Working Hazard Checklist', 'Confidentiality Form',
  'Passport', 'Visa / BRP', 'Certificate of Sponsorship', 'English Language Test', 'TB Test Certificate', 'Overseas Police Check',
  'Other',
];

// Standard onboarding documents — added to the default checklist as their own
// document requirements (all applying to every staff member).
const ONBOARDING_DOCS: { id: string; label: string; category: string }[] = [
  { id: 'sf-interview', label: 'Interview Questionnaire', category: 'Interview Questionnaire' },
  { id: 'sf-payroll', label: 'Payroll Form', category: 'Payroll Form' },
  { id: 'sf-induction-conf', label: 'Staff induction confirmation', category: 'Staff Induction Confirmation' },
  { id: 'sf-consent-dbs', label: 'Consent to hold DBS', category: 'Consent to Hold DBS' },
  { id: 'sf-application', label: 'Application Form', category: 'Application Form' },
  { id: 'sf-shadowing', label: 'Shadowing Form', category: 'Shadowing Form' },
  { id: 'sf-induction-training', label: 'Induction Training', category: 'Induction Training' },
  { id: 'sf-dbs-id', label: 'DBS ID Form', category: 'DBS ID Form' },
  { id: 'sf-lone-working', label: 'Lone Working Hazard Checklist', category: 'Lone Working Hazard Checklist' },
  { id: 'sf-confidentiality', label: 'Confidentiality Form', category: 'Confidentiality Form' },
];

export const DEFAULT_REQUIREMENTS: Requirement[] = [
  { id: 'identity', label: 'Proof of identity', type: 'identity', required: true, appliesTo: 'ALL', minCount: 2, tab: 'Documents',
    hint: 'Upload the required number of ID / Passport documents in Documents.' },
  { id: 'dbs', label: 'DBS certificate', type: 'dbs', required: true, appliesTo: 'ALL', tab: 'Documents',
    hint: 'Upload the DBS certificate in Documents.' },
  { id: 'references', label: 'Reference(s)', type: 'references', required: true, appliesTo: 'ALL', minCount: 1, tab: 'Documents',
    hint: 'Upload the required number of references in Documents.' },
  { id: 'rightToWork', label: 'Right to work', type: 'rightToWork', required: true, appliesTo: 'ALL', tab: 'Documents',
    hint: 'Upload right-to-work evidence (passport / visa / share code) in Documents.' },
  { id: 'contract', label: 'Employment contract', type: 'contract', required: true, appliesTo: 'ALL', tab: 'Documents',
    hint: 'Upload the signed contract of employment in Documents.' },
  { id: 'training', label: 'Qualifications / training', type: 'training', required: true, appliesTo: 'ALL', tab: 'Training',
    hint: 'Add a training record, or upload a training certificate in Documents.' },
  { id: 'fitForWork', label: 'Fit for work declaration', type: 'fitForWork', required: true, appliesTo: 'ALL', tab: 'Fit for Work',
    hint: 'Complete and sign the Fit for Work declaration, or upload the signed form.' },
  { id: 'emergencyContact', label: 'Emergency contact', type: 'emergencyContact', required: true, appliesTo: 'ALL', tab: 'Emergency Contact',
    hint: 'Record a next-of-kin / emergency contact name on the Emergency Contact tab.' },
  // Standard onboarding documents (apply to every staff member).
  ...ONBOARDING_DOCS.map((d): Requirement => ({
    id: d.id, label: d.label, type: 'document', category: d.category, required: true, appliesTo: 'ALL', tab: 'Documents',
    hint: `Upload the ${d.label} in Documents.`,
  })),
  // Overseas-only paperwork — counted only for staff marked as Overseas.
  { id: 'os-passport', label: 'Passport (valid)', type: 'document', category: 'Passport', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the passport photo page in Documents.' },
  { id: 'os-visa', label: 'Visa / BRP', type: 'document', category: 'Visa / BRP', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the visa / Biometric Residence Permit (or share code) in Documents.' },
  { id: 'os-cos', label: 'Certificate of Sponsorship', type: 'document', category: 'Certificate of Sponsorship', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the Certificate of Sponsorship (CoS) in Documents.' },
  { id: 'os-english', label: 'English language evidence', type: 'document', category: 'English Language Test', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the approved English language test / evidence in Documents.' },
  { id: 'os-tb', label: 'TB test certificate', type: 'document', category: 'TB Test Certificate', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the TB test certificate (required from listed countries) in Documents.' },
  { id: 'os-police', label: 'Overseas police clearance', type: 'document', category: 'Overseas Police Check', required: true, appliesTo: 'OVERSEAS', tab: 'Documents',
    hint: 'Upload the overseas criminal-record / police clearance in Documents.' },
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
    // Proof of identity requires actual ID document(s) — the profile photo /
    // avatar does not count. Honours minCount so a company can require two
    // forms of ID.
    case 'identity': return docCount(i, 'ID / Passport') >= min;
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
      const appliesTo = AppliesToValues.includes(r.appliesTo as AppliesTo) ? (r.appliesTo as AppliesTo) : 'ALL';
      return {
        id: String(r.id || `req-${idx}`).slice(0, 60),
        label: label.slice(0, 80),
        hint: String(r.hint || '').trim().slice(0, 200),
        type,
        required: r.required !== false,
        appliesTo,
        ...(category ? { category } : {}),
        ...(minCount ? { minCount } : {}),
        tab: r.tab ? String(r.tab).slice(0, 40) : (type === 'document' ? 'Documents' : undefined),
      };
    })
    .filter((r): r is Requirement => r !== null)
    .slice(0, 40);
}

// A requirement applies to this staff member when it's required AND its
// appliesTo matches their staff type (ALL matches everyone).
function appliesToStaff(req: Requirement, staffType: StaffType): boolean {
  if (!req.required) return false;
  const scope = req.appliesTo || 'ALL';
  return scope === 'ALL' || scope === staffType;
}

export function evaluateCompliance(input: ComplianceInput, requirements: Requirement[] = DEFAULT_REQUIREMENTS): ComplianceResult {
  const active = requirements.filter((r) => appliesToStaff(r, input.staffType));
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
