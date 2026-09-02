// Staff-file compliance requirement definitions — mirror of the backend
// (backend/src/lib/staffCompliance.ts). The backend is the source of truth for
// *evaluation*; this file just gives the Settings editor the type list, the
// document categories to pick from, and the built-in defaults to seed / reset.

export type RequirementType =
  | 'identity' | 'dbs' | 'references' | 'rightToWork' | 'contract'
  | 'training' | 'fitForWork' | 'emergencyContact' | 'document';

export interface Requirement {
  id: string;
  label: string;
  hint: string;
  type: RequirementType;
  required: boolean;
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
  identity: false, dbs: false, references: true, rightToWork: false, contract: false,
  training: false, fitForWork: false, emergencyContact: false, document: true,
};

// The document categories staff files offer (must match DocumentsTab USER list).
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
