import { computeReadiness } from '../controllers/cqcController';
import { staffFileCompliance } from '../controllers/userController';

/**
 * Building an audit from what Caremid already knows.
 *
 * The counting half of a Reg 17 audit is work a person should not be doing by
 * hand: who has no risk assessment, whose file is short a reference, which
 * visits are uncovered. All of it is already computed for the CQC dashboard,
 * so the runner reads THAT rather than querying again - an audit that scored
 * a client differently from the screen the manager is looking at would be
 * worse than no audit.
 *
 * What it does not do is judge. Whether a care plan is person-centred, or a
 * daily note says what actually happened, needs somebody to read one. So every
 * audit this produces is saved OPEN with the sample named in its findings, and
 * closing it is a human act. An audit that only counts is a report; what makes
 * it an audit is the part that comes next.
 */

export interface BuiltAction {
  title: string;
  detail: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueInDays: number;
}

export interface BuiltAudit {
  title: string;
  scope: string;
  score: number | null;
  maxScore: number | null;
  findings: string;
  actions: BuiltAction[];
}

/**
 * Which dashboard checks belong to which audit, and what a reader of that
 * audit should go and look at by hand afterwards.
 */
const AREAS: Record<string, { title: string; checks: string[]; sample: string[] }> = {
  CARE_PLAN: {
    title: 'Care plans and client records',
    checks: [
      'care_plan_missing', 'care_plan_review', 'risk_assessments', 'consent_contract',
      'review_overdue', 'one_page_profile', 'likes_dislikes', 'allergies_recorded',
      'resuscitation_status',
    ],
    sample: [
      'Read six care plans in full for whether they are person-centred and current, not merely present.',
      'Check that the people named below have been chased, not just recorded as missing.',
    ],
  },
  MAR: {
    title: 'MAR charts and medication',
    checks: ['missed_meds'],
    sample: [
      'Read the MAR chart for every client named below and record WHY each dose was missed.',
      'Refused, unavailable and not offered are three different failures with three different answers.',
      'Not tested by this audit: PRN protocols, controlled drugs, chart accuracy.',
    ],
  },
  RECRUITMENT_FILE: {
    title: 'Recruitment files',
    checks: [],
    sample: [
      'Read five files end to end, including any with no DBS certificate.',
      'Where a reference cannot be obtained, record a reference-gap assessment on the file: what is held, what was attempted and when, why it cannot be got, and what mitigates it.',
    ],
  },
  CALL_MONITORING: {
    title: 'Call monitoring and staff support',
    checks: ['unassigned_shifts', 'supervision_overdue', 'spot_check_overdue'],
    sample: [
      'Confirm whether uncovered visits are genuinely unstaffed or sit on a rota that has not been published — those are very different findings.',
      'Sample ten sets of daily notes across different carers and clients, for whether the record says what was actually done.',
      'Check that annual appraisals are being held, which Caremid does not track.',
    ],
  },
};

export const RUNNABLE_AUDITS = Object.keys(AREAS);

/** A red check is a finding to act on this month; amber is this quarter. */
const priorityFor = (status: string): 'HIGH' | 'MEDIUM' => (status === 'red' ? 'HIGH' : 'MEDIUM');
const dueFor = (status: string): number => (status === 'red' ? 7 : 28);

function namesOf(items: { label: string }[], cap = 25): string {
  if (!items.length) return '';
  const shown = items.slice(0, cap).map((i) => i.label.replace(/\s+/g, ' ').trim());
  const more = items.length - shown.length;
  return shown.join(', ') + (more > 0 ? `, and ${more} more` : '');
}

export async function buildAudit(type: string, now = new Date()): Promise<BuiltAudit> {
  const area = AREAS[type];
  if (!area) throw new Error(`${type} cannot be run automatically.`);

  if (type === 'RECRUITMENT_FILE') return buildRecruitmentAudit(area, now);

  const readiness = await computeReadiness();
  const all = readiness.keyQuestions.flatMap((k) => k.checks);
  const picked = area.checks.map((id) => all.find((c) => c.id === id)).filter((c) => !!c);

  const lines: string[] = [];
  const actions: BuiltAction[] = [];
  let score = 0;
  let max = 0;

  for (const c of picked) {
    const met = Math.max(0, c.total - c.count);
    // A check with no population to measure (unassigned visits counts events,
    // not people) still belongs in the findings but cannot be scored.
    if (c.total > 0) {
      score += met;
      max += c.total;
      lines.push(`${c.title}: ${met}/${c.total}${c.count ? ` — ${namesOf(c.items)}` : ''}`);
    } else {
      lines.push(`${c.title}: ${c.detail}`);
    }

    if (c.status !== 'green') {
      actions.push({
        title: c.title,
        detail: `${c.detail}${c.items.length ? ` Records: ${namesOf(c.items)}.` : ''}`,
        priority: priorityFor(c.status),
        dueInDays: dueFor(c.status),
      });
    }
  }

  const findings = [
    ...lines,
    '',
    'Still to be done by hand before this audit is closed:',
    ...area.sample.map((s) => `- ${s}`),
  ].join('\n');

  return {
    title: area.title,
    scope: `Full census from Caremid on ${now.toLocaleDateString('en-GB')}. ${picked.length} check(s) across the whole active caseload.`,
    score: max > 0 ? score : null,
    maxScore: max > 0 ? max : null,
    findings,
    actions,
  };
}

async function buildRecruitmentAudit(
  area: { title: string; sample: string[] },
  now: Date,
): Promise<BuiltAudit> {
  const rows = await staffFileCompliance();
  const complete = rows.filter((r) => r.complete);
  const score = rows.reduce((n, r) => n + r.present, 0);
  const max = rows.reduce((n, r) => n + r.total, 0);

  // Group by what is missing, because "eleven people have no reference" is a
  // finding and eleven separate rows is a list.
  const byItem = new Map<string, string[]>();
  for (const r of rows) {
    for (const m of r.missing) byItem.set(m, [...(byItem.get(m) ?? []), r.name]);
  }
  const ranked = [...byItem.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines = [
    `Files complete: ${complete.length}/${rows.length}.`,
    `Requirements met across all files: ${score}/${max}.`,
    '',
    'Outstanding by requirement:',
    ...ranked.map(([item, who]) => `- ${item} — ${who.length}: ${who.slice(0, 25).join(', ')}${who.length > 25 ? ', and more' : ''}`),
  ];

  const actions: BuiltAction[] = ranked.map(([item, who]) => ({
    title: `${item} — ${who.length} staff`,
    detail: `Outstanding for: ${who.slice(0, 40).join(', ')}.`,
    // A missing DBS or reference is a fitness question under Schedule 3, not
    // a filing one, so it does not wait a month.
    priority: /DBS|Reference|Right to work|contract/i.test(item) ? 'HIGH' : 'MEDIUM',
    dueInDays: /DBS|Reference|Right to work|contract/i.test(item) ? 7 : 28,
  }));

  return {
    title: area.title,
    scope: `All ${rows.length} active staff files on Caremid, scored against the configured Regulation 19 checklist, ${now.toLocaleDateString('en-GB')}.`,
    score,
    maxScore: max,
    findings: [
      ...lines,
      '',
      'Still to be done by hand before this audit is closed:',
      ...area.sample.map((s) => `- ${s}`),
    ].join('\n'),
    actions,
  };
}
