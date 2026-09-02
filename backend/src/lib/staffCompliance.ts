// Staff-file compliance — the checklist that decides whether a staff member's
// personnel file is "complete" for CQC purposes. Modelled on the eight
// categories of information required by Schedule 3 of the Health and Social
// Care Act 2008 (Regulated Activities) Regulations 2014 (Regulation 19 — fit
// and proper persons employed), mapped onto the records the app already holds:
// uploaded Documents (by category), Training records, the Fit for Work
// declaration, the staff photo and the emergency contact.
//
// This is the single source of truth — both the per-staff breakdown
// (GET /users/:id/compliance) and the all-staff summary (GET /users/compliance)
// evaluate against it, so the two can never drift apart.

export interface ComplianceInput {
  photo?: string | null;
  fitForWork?: unknown; // JSON blob { signedName, signedDate, ... } or null
  emergencyContactName?: string | null;
  docCategories: Set<string>; // document categories present for this staff member
  trainingCount: number; // number of training records held
}

export interface ComplianceItem {
  id: string;
  label: string;
  ok: boolean;
  hint: string; // how to satisfy it — shown to office staff when missing
}

export interface ComplianceResult {
  items: ComplianceItem[];
  missing: string[]; // labels of the items not yet satisfied
  total: number;
  present: number;
  complete: boolean;
}

// True when the Fit for Work declaration has actually been signed off (a blank
// object saved by opening the tab shouldn't count).
function fitForWorkSigned(f: unknown): boolean {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  return !!(o.signedName && String(o.signedName).trim()) && !!(o.signedDate && String(o.signedDate).trim());
}

// The requirement definitions. Each says how it can be satisfied from the
// inputs above. Document categories match the USER categories offered in the
// Documents tab (DocumentsTab.tsx).
const REQUIREMENTS: { id: string; label: string; hint: string; satisfied: (i: ComplianceInput) => boolean }[] = [
  {
    id: 'identity',
    label: 'Proof of identity',
    hint: 'Add a profile photo, or upload an ID / Passport document.',
    satisfied: (i) => !!(i.photo && i.photo.trim()) || i.docCategories.has('ID / Passport'),
  },
  {
    id: 'dbs',
    label: 'DBS certificate',
    hint: 'Upload the DBS certificate in Documents.',
    satisfied: (i) => i.docCategories.has('DBS Certificate'),
  },
  {
    id: 'references',
    label: 'Reference(s)',
    hint: 'Upload at least one reference in Documents.',
    satisfied: (i) => i.docCategories.has('Reference'),
  },
  {
    id: 'rightToWork',
    label: 'Right to work',
    hint: 'Upload right-to-work evidence (passport / visa / share code) in Documents.',
    satisfied: (i) => i.docCategories.has('Right to Work'),
  },
  {
    id: 'contract',
    label: 'Employment contract',
    hint: 'Upload the signed contract of employment in Documents.',
    satisfied: (i) => i.docCategories.has('Contract'),
  },
  {
    id: 'training',
    label: 'Qualifications / training',
    hint: 'Add a training record, or upload a training certificate in Documents.',
    satisfied: (i) => i.trainingCount > 0 || i.docCategories.has('Training Certificate'),
  },
  {
    id: 'fitForWork',
    label: 'Fit for work declaration',
    hint: 'Complete and sign the Fit for Work declaration, or upload the signed form.',
    satisfied: (i) => fitForWorkSigned(i.fitForWork) || i.docCategories.has('Fit for Work'),
  },
  {
    id: 'emergencyContact',
    label: 'Emergency contact',
    hint: 'Record a next-of-kin / emergency contact name on the Emergency Contact tab.',
    satisfied: (i) => !!(i.emergencyContactName && i.emergencyContactName.trim()),
  },
];

export function evaluateCompliance(input: ComplianceInput): ComplianceResult {
  const items: ComplianceItem[] = REQUIREMENTS.map((r) => ({
    id: r.id,
    label: r.label,
    hint: r.hint,
    ok: r.satisfied(input),
  }));
  const missing = items.filter((i) => !i.ok).map((i) => i.label);
  const present = items.length - missing.length;
  return { items, missing, total: items.length, present, complete: missing.length === 0 };
}
