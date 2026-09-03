// Staff-file compliance requirement definitions — mirror of the backend
// (backend/src/lib/staffCompliance.ts). The backend is the source of truth for
// *evaluation*; this file just gives the Settings editor the type list, the
// document categories to pick from, and the built-in defaults to seed / reset.

export type RequirementType =
  | 'identity' | 'dbs' | 'references' | 'rightToWork' | 'contract'
  | 'training' | 'fitForWork' | 'emergencyContact' | 'document';

// Local (UK) vs Overseas (international) recruitment.
export type StaffType = 'LOCAL' | 'OVERSEAS';
export const STAFF_TYPE_LABEL: Record<StaffType, string> = { LOCAL: 'Local', OVERSEAS: 'Overseas' };

// Which staff a requirement applies to.
export type AppliesTo = 'ALL' | 'LOCAL' | 'OVERSEAS';
export const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  ALL: 'All staff', LOCAL: 'Local only', OVERSEAS: 'Overseas only',
};

export interface Requirement {
  id: string;
  label: string;
  hint: string;
  type: RequirementType;
  required: boolean;
  appliesTo?: AppliesTo;
  category?: string;
  minCount?: number;
  tab?: string;
}

// Human labels for each requirement type, shown in the editor's type dropdown.
export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  identity: 'Proof of identity (photo or ID document)',
  dbs: 'DBS certificate (document)',
  references: 'References (documents)',
  rightToWork: 'Right to work (document)',
  contract: 'Employment contract (document)',
  training: 'Qualifications / training (record or certificate)',
  fitForWork: 'Fit for work declaration (signed or document)',
  emergencyContact: 'Emergency contact (recorded)',
  document: 'Custom document (choose category)',
};

// Whether a given type lets the editor pick a document category.
export const TYPE_USES_CATEGORY: Record<RequirementType, boolean> = {
  identity: false, dbs: false, references: false, rightToWork: false, contract: false,
  training: false, fitForWork: false, emergencyContact: false, document: true,
};

// Whether a given type lets the editor set "how many" are required.
export const TYPE_USES_COUNT: Record<RequirementType, boolean> = {
  identity: true, dbs: false, references: true, rightToWork: false, contract: false,
  training: false, fitForWork: false, emergencyContact: false, document: true,
};

// The document categories staff files offer (must match DocumentsTab USER list).
// The second row is the extra paperwork typically held for overseas recruits.
export const USER_DOC_CATEGORIES = [
  'DBS Certificate', 'Contract', 'Reference', 'Right to Work',
  'Training Certificate', 'ID / Passport', 'Fit for Work',
  'Proof of Address', 'Interview Questionnaire', 'Payroll Form', 'Staff Induction Confirmation', 'Consent to Hold DBS', 'Application Form', 'Shadowing Form', 'Induction Training', 'DBS ID Form', 'Lone Working Hazard Checklist', 'Confidentiality Form',
  'Passport', 'Visa / BRP', 'Certificate of Sponsorship', 'English Language Test', 'TB Test Certificate', 'Overseas Police Check',
  'Other',
];

// Standard onboarding documents added to the default checklist (all staff).
const ONBOARDING_DOCS: { id: string; label: string; category: string }[] = [
  { id: 'sf-proof-address', label: 'Proof of address', category: 'Proof of Address' },
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

// Resolve the stored JSON string into rows for the editor: empty / invalid falls
// back to the built-in defaults (matches backend parseRequirements).
export function resolveRequirements(raw: string | null | undefined): Requirement[] {
  if (!raw) return DEFAULT_REQUIREMENTS;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr as Requirement[];
  } catch { /* fall through */ }
  return DEFAULT_REQUIREMENTS;
}
