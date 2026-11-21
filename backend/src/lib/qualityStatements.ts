/**
 * The CQC single assessment framework: 34 quality statements across the five
 * key questions, and the automated checks that evidence each one.
 *
 * This catalogue is the join that was missing. Caremid already ran ~35 checks
 * and separately asked a manager to rate 21 statements by hand, with nothing
 * connecting the two: a statement could be thoroughly evidenced by data and
 * still sit on the self-assessment page waiting for someone to tick it, and a
 * manager's rating never reached the score. One list, one engine.
 *
 * `checks` holds the ids of the automated checks that bear on a statement.
 * Where it is empty the system genuinely cannot judge - kindness, leadership,
 * whether information is given in a form people understand - and the honest
 * answer is to say so and ask, rather than to score the statement as though
 * the absence of a record were evidence of anything.
 */

export type KeyQuestion = 'safe' | 'effective' | 'caring' | 'responsive' | 'wellled';

export interface QualityStatement {
  key: string;
  label: string;
  keyQuestion: KeyQuestion;
  /** Ids from computeReadiness(). Empty means no data can settle it. */
  checks: string[];
  /** What a manager should look at when the data cannot decide. */
  lookFor?: string;
}

export const QUALITY_STATEMENTS: QualityStatement[] = [
  // ---------------------------------------------------------------- Safe
  { key: 'safe_learning', label: 'Learning culture', keyQuestion: 'safe',
    checks: ['incidents', 'candour_decision', 'candour_done'] },
  { key: 'safe_systems', label: 'Safe systems, pathways and transitions', keyQuestion: 'safe',
    checks: ['allergies_recorded'],
    lookFor: 'How information travels with someone between hospital, GP and the service.' },
  { key: 'safe_safeguarding', label: 'Safeguarding', keyQuestion: 'safe',
    checks: ['safeguarding_lead', 'safeguarding_open', 'safeguarding_referral_ref'] },
  { key: 'safe_risks', label: 'Involving people to manage risks', keyQuestion: 'safe',
    checks: ['risk_assessments'] },
  { key: 'safe_environments', label: 'Safe environments', keyQuestion: 'safe', checks: [],
    lookFor: 'Equipment checks, home environment risk assessments, lone-working arrangements.' },
  { key: 'safe_staffing', label: 'Safe and effective staffing', keyQuestion: 'safe',
    checks: ['training_expired', 'supervision_overdue', 'unassigned_shifts'] },
  { key: 'safe_ipc', label: 'Infection prevention and control', keyQuestion: 'safe', checks: [],
    lookFor: 'IPC policy in date, PPE supply, hand-hygiene observations, IPC training uptake.' },
  { key: 'safe_medicines', label: 'Medicines optimisation', keyQuestion: 'safe',
    checks: ['missed_meds'] },

  // ----------------------------------------------------------- Effective
  { key: 'eff_assessing', label: 'Assessing needs', keyQuestion: 'effective',
    checks: ['care_plan_missing', 'care_plan_review'] },
  { key: 'eff_evidence', label: 'Delivering evidence-based care and treatment', keyQuestion: 'effective', checks: [],
    lookFor: 'Which standards and guidance the care follows, and how staff know about them.' },
  { key: 'eff_teams', label: 'How staff, teams and services work together', keyQuestion: 'effective', checks: [],
    lookFor: 'Handovers, GP and district nurse liaison, multi-disciplinary involvement.' },
  { key: 'eff_healthier', label: 'Supporting people to live healthier lives', keyQuestion: 'effective', checks: [],
    lookFor: 'Nutrition and hydration support, falls prevention, health promotion in care plans.' },
  { key: 'eff_outcomes', label: 'Monitoring and improving outcomes', keyQuestion: 'effective',
    checks: ['review_overdue'] },
  { key: 'eff_consent', label: 'Consent to care and treatment', keyQuestion: 'effective',
    checks: ['consent_contract', 'capacity_best_interest', 'capacity_review', 'capacity_deprivation', 'legal_authority_evidence'] },

  // -------------------------------------------------------------- Caring
  { key: 'car_dignity', label: 'Kindness, compassion and dignity', keyQuestion: 'caring', checks: [],
    lookFor: 'Spot-check observations, client feedback, compliments, complaint themes.' },
  { key: 'car_individuals', label: 'Treating people as individuals', keyQuestion: 'caring',
    checks: ['one_page_profile'] },
  { key: 'car_independence', label: 'Independence, choice and control', keyQuestion: 'caring',
    checks: ['likes_dislikes'] },
  { key: 'car_immediate', label: "Responding to people's immediate needs", keyQuestion: 'caring', checks: [],
    lookFor: 'How staff respond to pain, distress or deterioration during a visit.' },
  { key: 'car_workforce', label: 'Workforce wellbeing and enablement', keyQuestion: 'caring', checks: [],
    lookFor: 'Staff survey, retention, wellbeing support, how staff raise concerns about workload.' },

  // ---------------------------------------------------------- Responsive
  { key: 'res_person_centred', label: 'Person-centred care', keyQuestion: 'responsive',
    checks: ['sl_support_plan'] },
  { key: 'res_continuity', label: 'Care provision, integration and continuity', keyQuestion: 'responsive', checks: [],
    lookFor: 'Consistency of carers, continuity across a package, work with other providers.' },
  { key: 'res_information', label: 'Providing information', keyQuestion: 'responsive', checks: [],
    lookFor: 'Accessible Information Standard: formats, languages, communication needs recorded and met.' },
  { key: 'res_listening', label: 'Listening to and involving people', keyQuestion: 'responsive',
    checks: ['complaints', 'complaints_acknowledged', 'complaints_responded', 'complaints_ombudsman'] },
  { key: 'res_access', label: 'Equity in access', keyQuestion: 'responsive', checks: [],
    lookFor: 'Who the service can and cannot take, and whether anyone is disadvantaged by that.' },
  { key: 'res_equity', label: 'Equity in experiences and outcomes', keyQuestion: 'responsive', checks: [],
    lookFor: 'Whether outcomes differ across protected characteristics, and what is done about it.' },
  { key: 'res_future', label: 'Planning for the future', keyQuestion: 'responsive',
    checks: ['resuscitation_status'] },

  // ------------------------------------------------------------ Well-led
  { key: 'wl_direction', label: 'Shared direction and culture', keyQuestion: 'wellled', checks: [],
    lookFor: 'Vision and values, whether staff recognise them, how they show up in practice.' },
  { key: 'wl_leaders', label: 'Capable, compassionate and inclusive leaders', keyQuestion: 'wellled', checks: [],
    lookFor: 'Leadership capacity, training, how leaders are visible to staff and people using the service.' },
  { key: 'wl_speakup', label: 'Freedom to speak up', keyQuestion: 'wellled',
    checks: ['speak_up'] },
  { key: 'wl_edi', label: 'Workforce equality, diversity and inclusion', keyQuestion: 'wellled', checks: [],
    lookFor: 'Workforce profile, EDI training, how discrimination complaints are handled.' },
  { key: 'wl_governance', label: 'Governance, management and sustainability', keyQuestion: 'wellled',
    checks: ['audit_programme', 'audit_due', 'improvement_actions', 'policy_library', 'policy_review', 'spot_check_overdue'] },
  { key: 'wl_partnerships', label: 'Partnerships and communities', keyQuestion: 'wellled', checks: [],
    lookFor: 'Work with commissioners, the local authority, health partners and advocacy.' },
  { key: 'wl_learning', label: 'Learning, improvement and innovation', keyQuestion: 'wellled', checks: [],
    lookFor: 'What changed as a result of an audit, a complaint or an incident.' },
  { key: 'wl_sustainability', label: 'Environmental sustainability', keyQuestion: 'wellled', checks: [],
    lookFor: 'Travel and journey planning, waste, energy use.' },
];

export const STATEMENTS_BY_KEY = new Map(QUALITY_STATEMENTS.map((s) => [s.key, s]));

/**
 * MET / PARTIALLY_MET / NOT_MET come from data. INSUFFICIENT_EVIDENCE is not
 * a failure - it says the system holds nothing that can settle this, and a
 * person needs to look. Treating it as a failure would score a service down
 * for a record Caremid was never designed to hold.
 */
export type StatementStatus = 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'INSUFFICIENT_EVIDENCE';

export const STATUS_LABEL: Record<StatementStatus, string> = {
  MET: 'Met',
  PARTIALLY_MET: 'Partially met',
  NOT_MET: 'Not met',
  INSUFFICIENT_EVIDENCE: 'Management review required',
};

/** A manager can only record a judgement; they cannot record "no evidence". */
export const REVIEWABLE_STATUSES: StatementStatus[] = ['MET', 'PARTIALLY_MET', 'NOT_MET'];
