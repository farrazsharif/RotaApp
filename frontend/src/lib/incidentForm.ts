// Care 24's Accident & Incident Form — the office half of an incident record.
//
// Reproduced from the company's own Word template, which follows the HSE
// incident investigation checklist. Every row is Yes / No / Notes, exactly as
// the paper is, so the two can be read side by side.
//
// This is NOT what the carer fills in. Securing a scene, identifying witnesses,
// reaching root causes and deciding about RIDDOR is work the office does over
// the following days, and asking a carer at the time would produce guesses.

export interface IncidentQuestion {
  // Stable key. Never change one — it is what an answer is stored against.
  key: string;
  label: string;
}

export interface IncidentQuestionGroup {
  id: string;
  title: string;
  questions: IncidentQuestion[];
}

// Value stored per question.
export interface IncidentAnswer {
  v: '' | 'YES' | 'NO' | 'NA';
  notes: string;
}

export const INCIDENT_INVESTIGATION: IncidentQuestionGroup[] = [
  {
    id: 'injured',
    title: 'The Injured Person',
    questions: [
      { key: 'treatment', label: 'Have they received appropriate treatment?' },
      { key: 'recovery', label: 'Is everything possible being done to help their recovery?' },
    ],
  },
  {
    id: 'immediate',
    title: 'Other Immediate Action',
    questions: [
      { key: 'prevent', label: 'Is any other action necessary straightaway to prevent further injury or loss?' },
    ],
  },
  {
    id: 'informing',
    title: 'Informing People',
    questions: [
      {
        key: 'informed',
        label:
          'Have the right people been informed internally and externally? (e.g. family; colleagues including any safety reps; senior management; the enforcing authority (RIDDOR); insurers)',
      },
    ],
  },
  {
    id: 'investigation',
    title: 'The Investigation',
    questions: [
      { key: 'rightPeople', label: 'Have you got the right people involved?' },
      { key: 'sceneSecured', label: 'Has the scene been secured to preserve evidence?' },
      { key: 'photos', label: 'Has someone taken photos?' },
      { key: 'lessons', label: 'Is the investigation focusing on lessons to be learned, rather than who may have been at fault?' },
      { key: 'witnesses', label: 'Have witnesses been identified?' },
      {
        key: 'interviews',
        label:
          'Are interviews held in private and as soon as possible to maximise recall and prevent one person being influenced by another?',
      },
      { key: 'sequence', label: 'Have we got a clear idea of the sequence of events? (A timeline can be very helpful here.)' },
      { key: 'bottom', label: 'Have we really got to the bottom of what happened?' },
      {
        key: 'rootCauses',
        label: 'Are we then going beyond this to identify the root causes, even if these involve facing up to unpleasant truths?',
      },
    ],
  },
  {
    id: 'followon',
    title: 'The Follow On',
    questions: [
      {
        key: 'recommendations',
        label:
          'Have we got practical recommendations which address the root causes and which, if taken, will prevent a recurrence?',
      },
      { key: 'cooperated', label: 'Have we co-operated with interested parties, such as HSE inspectors, insurance investigators, etc?' },
      { key: 'owners', label: 'Have we identified owners and timescales for completion of the recommended actions?' },
      { key: 'checked', label: 'Once the actions have been taken, has someone checked them?' },
      { key: 'effective', label: 'Were they effective?' },
      { key: 'newRisks', label: 'Did they introduce any new risks? (If yes, consider what further action is needed.)' },
      { key: 'recorded', label: 'Has everything been properly recorded?' },
      { key: 'thanked', label: 'Did we thank people for their help and highlight the positive learning outcomes?' },
    ],
  },
];

export const INCIDENT_QUESTION_COUNT = INCIDENT_INVESTIGATION.reduce((n, g) => n + g.questions.length, 0);

// Free-text conclusion, stored alongside the answers under this key.
export const INCIDENT_CONCLUSION_KEY = '__conclusion';

export const KIND_LABEL: Record<string, string> = {
  ACCIDENT: 'Accident',
  INCIDENT: 'Incident',
  NEAR_MISS: 'Near miss',
};

export const STATUS_LABEL: Record<string, string> = {
  REPORTED: 'Reported',
  INVESTIGATING: 'Investigating',
  CLOSED: 'Closed',
};

export const STATUS_TONE: Record<string, string> = {
  REPORTED: 'bg-red-100 text-red-700',
  INVESTIGATING: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-green-100 text-green-700',
};

// How many questions have an answer — drives the progress shown on the record.
export function answeredCount(values: Record<string, unknown>): number {
  let n = 0;
  for (const g of INCIDENT_INVESTIGATION) {
    for (const q of g.questions) {
      const a = values[q.key] as IncidentAnswer | undefined;
      if (a && a.v) n++;
    }
  }
  return n;
}
