// Single source of truth for the 7 tracked client documents that make a service
// user's file "complete". The exact `label` strings match the backend's
// `missing` array (GET /service-users/compliance) and the display strings used
// across the app, so the Service Users badge, the company-wide Documents page
// and the per-client Documents checklist can never drift.
//
// Completeness rules mirror backend/src/controllers/serviceUserController.ts
// (getServiceUsersCompliance) exactly — keep the two in step.

// Any one of these risk-assessment types satisfies the "Risk Assessment" doc.
export const RA_CORE_TYPES = ['ENVIRONMENT', 'FIRE_SAFETY', 'BATHING'] as const;

export type DocKey =
  | 'CARE_PLAN'
  | 'RISK_ASSESSMENT'
  | 'FIRE_SAFETY_RA'
  | 'PERSONAL_SERVICE_PLAN'
  | 'ONE_PAGE_PROFILE'
  | 'LIKES_DISLIKES'
  | 'CONTRACT_OF_CARE'
  | 'SUPPORT_PLAN';

export interface DocDef {
  key: DocKey;
  /** Exact display string — must equal the string the backend puts in `missing`. */
  label: string;
  /** Short column header for the wide company-wide table. */
  short: string;
  /** Only required for SUPPORTED_LIVING clients; "—" (not applicable) otherwise. */
  slOnly?: boolean;
}

// Order matches the backend's `missing` push order.
export const SERVICE_USER_DOCS: DocDef[] = [
  { key: 'CARE_PLAN', label: 'Care Plan', short: 'Care Plan' },
  { key: 'RISK_ASSESSMENT', label: 'Risk Assessment', short: 'Risk Assmt' },
  { key: 'FIRE_SAFETY_RA', label: 'Fire Safety Risk Assessment', short: 'Fire Safety' },
  { key: 'PERSONAL_SERVICE_PLAN', label: 'Personal Service Plan', short: 'PSP' },
  { key: 'ONE_PAGE_PROFILE', label: 'One Page Profile', short: '1-Page' },
  { key: 'LIKES_DISLIKES', label: 'Likes & Dislikes', short: 'Likes/Dislikes' },
  { key: 'CONTRACT_OF_CARE', label: 'Contract of Care', short: 'Contract' },
  { key: 'SUPPORT_PLAN', label: 'Support Plan', short: 'Support Plan', slOnly: true },
];

export interface DocStatus {
  key: DocKey;
  label: string;
  /** false → not applicable to this client (render "—"). */
  applicable: boolean;
  done: boolean;
}

const isSL = (careType?: string | null) => careType === 'SUPPORTED_LIVING';

/**
 * Compute per-document status from the records already loaded on the detail
 * page. Kept identical to the backend rules so the on-page checklist and the
 * "N missing" badge agree.
 */
export function computeServiceUserDocs(inp: {
  careType?: string | null;
  hasCarePlan: boolean;
  hasServicePlan: boolean;
  hasLikesDislikes: boolean;
  raTypes: Set<string>;
}): DocStatus[] {
  return SERVICE_USER_DOCS.map((d) => {
    const applicable = !d.slOnly || isSL(inp.careType);
    let done = false;
    switch (d.key) {
      case 'CARE_PLAN': done = inp.hasCarePlan; break;
      case 'RISK_ASSESSMENT': done = RA_CORE_TYPES.some((x) => inp.raTypes.has(x)); break;
      case 'FIRE_SAFETY_RA': done = inp.raTypes.has('FIRE_SAFETY'); break;
      case 'PERSONAL_SERVICE_PLAN': done = inp.hasServicePlan; break;
      case 'ONE_PAGE_PROFILE': done = inp.raTypes.has('ONE_PAGE_PROFILE'); break;
      case 'LIKES_DISLIKES': done = inp.hasLikesDislikes; break;
      case 'CONTRACT_OF_CARE': done = inp.raTypes.has('CONTRACT_OF_CARE'); break;
      case 'SUPPORT_PLAN': done = inp.raTypes.has('SL_SUPPORT_PLAN'); break;
    }
    return { key: d.key, label: d.label, applicable, done: applicable && done };
  });
}

/**
 * Derive per-document status from the compliance endpoint's `missing` array
 * (used by the company-wide Documents page, where only the endpoint result and
 * the client's careType are available).
 */
export function docStatusFromMissing(missing: string[], careType?: string | null): DocStatus[] {
  const missingSet = new Set(missing);
  return SERVICE_USER_DOCS.map((d) => {
    const applicable = !d.slOnly || isSL(careType);
    return { key: d.key, label: d.label, applicable, done: applicable && !missingSet.has(d.label) };
  });
}

/** Labels of the applicable-but-not-done documents, in canonical order. */
export function missingDocLabels(statuses: DocStatus[]): string[] {
  return statuses.filter((s) => s.applicable && !s.done).map((s) => s.label);
}
