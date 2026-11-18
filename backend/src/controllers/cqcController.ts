import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getTenant } from '../lib/tenantContext';

// Each automated check maps to a CQC key question and a quality statement /
// regulation, so a red/amber flag is defensible in an inspection.
type CheckStatus = 'red' | 'amber' | 'green' | 'info';
interface CheckItem { id: string; label: string; link?: string }
interface Check {
  id: string;
  title: string;
  statement: string;   // e.g. "Involving people to manage risks · Reg 12"
  status: CheckStatus;
  count: number;       // number failing (0 = all good)
  total: number;       // population size the check ran over
  detail: string;      // one-line human explanation
  items: CheckItem[];  // the failing records (capped)
}
interface KeyQuestionBlock { key: string; label: string; score: number; checks: Check[] }

const KEY_QUESTIONS: { key: string; label: string }[] = [
  { key: 'safe', label: 'Safe' },
  { key: 'effective', label: 'Effective' },
  { key: 'caring', label: 'Caring' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'wellled', label: 'Well-led' },
];

const CAP = 50; // max drill-down items returned per check
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

// green = 1, amber = 0.5, red = 0; info excluded. Percentage across a block.
function scoreOf(checks: Check[]): number {
  const scored = checks.filter((c) => c.status !== 'info');
  if (!scored.length) return 100;
  const pts = scored.reduce((s, c) => s + (c.status === 'green' ? 1 : c.status === 'amber' ? 0.5 : 0), 0);
  return Math.round((pts / scored.length) * 100);
}

// The readiness sweep itself, with no Express in it, so the CQC dashboard and
// the in-app assistant read the same numbers rather than two implementations
// that drift apart. Company scope comes from the tenant context, as everywhere.
export async function computeReadiness() {
  // Active caseload (exclude discharged/deceased/inactive) and active care staff.
  const clients = await prisma.serviceUser.findMany({
    where: { active: true, status: { notIn: ['DISCHARGED', 'DECEASED'] } },
    select: { id: true, firstName: true, lastName: true, careType: true, allergies: true, dnacprStatus: true },
    orderBy: [{ lastName: 'asc' }],
  });
  const staff = await prisma.user.findMany({
    where: { active: true, role: { not: 'FAMILY_MEMBER' }, platformAdmin: false },
    // role is needed to work out which policies apply to whom.
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ lastName: 'asc' }],
  });
  const clientLink = (c: { id: string; firstName: string; lastName: string }): CheckItem => ({ id: c.id, label: `${c.firstName} ${c.lastName}`, link: `/service-users/${c.id}` });
  const staffLink = (s: { id: string; firstName: string; lastName: string }): CheckItem => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, link: `/users/${s.id}` });

  // --- Load supporting data in parallel ---
  const [carePlans, riskRows, likes, reviews, supervisions, spotChecks, trainings, missedMedRows, unassigned, concerns, sgSettings, audits, openActions, policies, policyAcks, capacityRows, authorities, feedback, incidents] = await Promise.all([
    prisma.carePlan.findMany({ select: { serviceUserId: true, reviewDate: true } }),
    prisma.riskAssessment.findMany({ select: { serviceUserId: true, type: true } }),
    prisma.likesDislikes.findMany({ select: { serviceUserId: true } }),
    prisma.review.findMany({ select: { serviceUserId: true, nextReviewDate: true } }),
    prisma.supervision.findMany({ select: { userId: true, nextReviewDate: true } }),
    prisma.spotCheck.findMany({ select: { carerId: true, date: true } }),
    prisma.training.findMany({ select: { userId: true, expiresAt: true } }),
    prisma.medAdministration.findMany({ where: { status: 'MISSED', scheduledFor: { gte: daysAgo(30) } }, select: { serviceUserId: true } }),
    prisma.shift.count({ where: { userId: null, status: 'SCHEDULED', date: { gte: now(), lte: daysAhead(7) } } }),
    prisma.safeguardingConcern.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true, kind: true, raisedAt: true, referredToLA: true, laReference: true, personAtRisk: true, serviceUser: { select: { firstName: true, lastName: true } } },
    }),
    prisma.orgSettings.findFirst({ select: { safeguardingLeadId: true } }),
    // Last 12 months only. This measures how the office is handling candour
    // now, not every incident ever filed - and the columns did not exist
    // before this shipped, so older rows would all read as undecided.
    prisma.audit.findMany({
      select: { id: true, type: true, title: true, auditedAt: true, nextDueDate: true, status: true },
      orderBy: { auditedAt: 'desc' },
    }),
    prisma.improvementAction.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: { id: true, title: true, dueDate: true, priority: true },
    }),
    prisma.policy.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, title: true, version: true, reviewDate: true, audience: true, requiresAck: true },
    }),
    prisma.policyAcknowledgement.findMany({ select: { policyId: true, userId: true, version: true } }),
    prisma.capacityAssessment.findMany({
      select: {
        id: true, serviceUserId: true, decision: true, outcome: true, reviewDate: true,
        biDecision: true, deprivationConcern: true, deprivationRaisedAt: true,
      },
    }),
    prisma.legalAuthority.findMany({
      where: { active: true },
      select: { id: true, serviceUserId: true, kind: true, registered: true, evidenceSeen: true },
    }),
    prisma.complaint.findMany({
      where: { receivedAt: { gte: daysAgo(365) } },
      select: {
        id: true, kind: true, reference: true, receivedAt: true, status: true,
        acknowledgedAt: true, respondedAt: true, outcome: true, ombudsmanSignposted: true,
        complainantName: true,
        serviceUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { receivedAt: 'desc' },
    }),
    prisma.incident.findMany({
      where: { occurredAt: { gte: daysAgo(365) } },
      select: {
        id: true, occurredAt: true, kind: true, status: true,
        candourRequired: true, candourHarm: true, candourToldAt: true, candourWrittenAt: true,
        serviceUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: 'desc' },
    }),
  ]);

  // Audits and the improvement plan (Reg 17). The loop an inspector follows:
  // are audits happening on a cycle, and did what they found get fixed.
  //
  // The schedule is read from the LATEST audit of each type, because that is
  // the one carrying the next due date. An older one being overdue says
  // nothing once a newer one has been done.
  const latestAuditByType = new Map<string, typeof audits[number]>();
  for (const a of audits) if (!latestAuditByType.has(a.type)) latestAuditByType.set(a.type, a);
  const latestAudits = [...latestAuditByType.values()];
  const auditsDue = latestAudits.filter((a) => a.nextDueDate && a.nextDueDate < now());
  const auditLink = (a: { id: string; type: string; title: string | null }): CheckItem => ({
    id: a.id,
    label: a.title || a.type.replace(/_/g, ' ').toLowerCase(),
    link: '/governance',
  });
  const actionsOverdue = openActions.filter((a) => a.dueDate && a.dueDate < now());
  const actionLink = (a: { id: string; title: string }): CheckItem => ({
    id: a.id, label: a.title, link: '/governance',
  });

  // Policies (Reg 17). Two questions: are they in date, and has anyone read
  // them. Signatures are counted against the CURRENT version only - counting
  // any version would report a policy as read when the version people read
  // has since been replaced, which is the failure the versioning exists to
  // prevent.
  const policyApplies = (audience: string, role: string) =>
    audience === 'ALL'
    || (audience === 'CARERS' && role === 'EMPLOYEE')
    || ((audience === 'OFFICE' || audience === 'MANAGERS') && (role === 'ADMIN' || role === 'MANAGER'));
  const stalePolicies = policies.filter((p) => p.reviewDate && p.reviewDate < now());
  const policyGaps = policies
    .filter((p) => p.requiresAck)
    .map((p) => {
      const due = staff.filter((u) => policyApplies(p.audience, u.role));
      const dueIds = new Set(due.map((u) => u.id));
      const signed = policyAcks.filter((a) => a.policyId === p.id && a.version === p.version && dueIds.has(a.userId)).length;
      return { ...p, outstanding: due.length - signed };
    })
    .filter((p) => p.outstanding > 0);
  const policyLink = (p: { id: string; title: string; version: string }): CheckItem => ({
    id: p.id,
    label: `${p.title} (v${p.version})`,
    link: '/policies',
  });

  // Mental capacity (Reg 11). Three things that go wrong, in the order they
  // get found: a finding with no best-interest decision behind it, a review
  // date that has passed (capacity returns, and a stale finding is used as if
  // it had not), and an authority nobody has actually looked at.
  const capacityLink = (r: { id: string; serviceUserId: string; decision: string }): CheckItem => {
    const c = clients.find((x) => x.id === r.serviceUserId);
    return {
      id: r.id,
      label: `${c ? `${c.firstName} ${c.lastName}` : 'Client'} - ${r.decision}`,
      link: c ? `/service-users/${c.id}` : undefined,
    };
  };
  const lacking = capacityRows.filter((r) => r.outcome === 'LACKS_CAPACITY');
  const noBestInterest = lacking.filter((r) => !r.biDecision);
  const staleCapacity = capacityRows.filter((r) => r.outcome && r.reviewDate && r.reviewDate < now());
  const dolUnraised = capacityRows.filter((r) => r.deprivationConcern && !r.deprivationRaisedAt);
  const authorityUnchecked = authorities.filter(
    (a) => !a.evidenceSeen || ((a.kind.startsWith('LPA_') || a.kind.startsWith('DEPUTY_')) && !a.registered),
  );
  const authorityLink = (a: { id: string; serviceUserId: string; kind: string }): CheckItem => {
    const c = clients.find((x) => x.id === a.serviceUserId);
    return {
      id: a.id,
      label: `${c ? `${c.firstName} ${c.lastName}` : 'Client'} - ${a.kind.replace(/_/g, ' ').toLowerCase()}`,
      link: c ? `/service-users/${c.id}` : undefined,
    };
  };

  // Complaints (Reg 16). The two clocks an inspector checks - acknowledged,
  // and responded to - plus whether anyone was told they could go further.
  // Working days are approximated as calendar days here: the dashboard is a
  // prompt to go and look, not the record itself.
  const ACK_DAYS = 3;
  const RESPONSE_DAYS = 28;
  const complaints = feedback.filter((f) => f.kind === 'COMPLAINT');
  const compliments = feedback.filter((f) => f.kind === 'COMPLIMENT');
  const complaintLabel = (f: { id: string; reference: string | null; receivedAt: Date; complainantName: string | null; serviceUser: { firstName: string; lastName: string } | null }): CheckItem => ({
    id: f.id,
    label: `${f.reference || f.complainantName || (f.serviceUser ? `${f.serviceUser.firstName} ${f.serviceUser.lastName}` : 'Complaint')}, ${f.receivedAt.toISOString().slice(0, 10)}`,
    link: '/complaints',
  });
  const open = complaints.filter((f) => f.status !== 'CLOSED');
  const ackLate = open.filter((f) => !f.acknowledgedAt && f.receivedAt < daysAgo(ACK_DAYS));
  const respLate = open.filter((f) => !f.respondedAt && f.receivedAt < daysAgo(RESPONSE_DAYS));
  // Closed, not upheld in full, and nobody recorded telling them they could
  // take it to the Ombudsman. New records cannot reach this state - the server
  // refuses the close - so anything here predates that rule or was imported.
  const noSignpost = complaints.filter(
    (f) => f.status === 'CLOSED' && (f.outcome === 'NOT_UPHELD' || f.outcome === 'PARTLY_UPHELD') && !f.ombudsmanSignposted,
  );

  // Duty of candour. Two separate failures: nobody has decided whether it
  // applies, and somebody decided it applies and then did not follow through.
  const incidentLabel = (i: { id: string; occurredAt: Date; kind: string; serviceUser: { firstName: string; lastName: string } | null }): CheckItem => ({
    id: i.id,
    label: `${i.kind.replace('_', ' ').toLowerCase()}${i.serviceUser ? ` - ${i.serviceUser.firstName} ${i.serviceUser.lastName}` : ''}, ${i.occurredAt.toISOString().slice(0, 10)}`,
    link: '/incidents',
  });
  // Only incidents with an actual outcome need the decision: a near miss with
  // nobody harmed does not engage Reg 20, and chasing those would train people
  // to click through the question rather than answer it.
  const candourRelevant = incidents.filter((i) => i.kind !== 'NEAR_MISS');
  const candourUndecided = candourRelevant.filter((i) => i.candourRequired === null);
  const candourOutstanding = incidents.filter(
    (i) => i.candourRequired === true && (!i.candourToldAt || !i.candourWrittenAt),
  );

  // Safeguarding. Three things an inspector tests, in the order they test
  // them: is someone named as responsible, is anything sitting open, and does
  // every referral have the reference that proves it was made.
  const openConcerns = concerns.filter((c) => c.kind === 'CONCERN');
  const openDisclosures = concerns.filter((c) => c.kind === 'WHISTLEBLOWING');
  const stale = openConcerns.filter((c) => c.raisedAt < daysAgo(30));
  const refMissing = openConcerns.filter((c) => c.referredToLA && !c.laReference);
  const concernLabel = (c: { personAtRisk: string | null; serviceUser: { firstName: string; lastName: string } | null }) =>
    c.serviceUser ? `${c.serviceUser.firstName} ${c.serviceUser.lastName}` : c.personAtRisk || 'Unnamed';
  const concernItems = (rows: typeof openConcerns): CheckItem[] =>
    rows.slice(0, CAP).map((c) => ({ id: c.id, label: concernLabel(c), link: '/safeguarding' }));

  const carePlanBy = new Map(carePlans.map((c) => [c.serviceUserId, c]));
  const riskTypesBy = new Map<string, Set<string>>();
  for (const r of riskRows) { if (!riskTypesBy.has(r.serviceUserId)) riskTypesBy.set(r.serviceUserId, new Set()); riskTypesBy.get(r.serviceUserId)!.add(r.type); }
  const hasType = (id: string, type: string) => riskTypesBy.get(id)?.has(type) ?? false;
  const likesSet = new Set(likes.map((l) => l.serviceUserId));

  const latestReview = new Map<string, Date | null>();
  for (const r of reviews) {
    const cur = latestReview.get(r.serviceUserId);
    const d = r.nextReviewDate;
    if (d && (!cur || d > cur)) latestReview.set(r.serviceUserId, d);
    else if (!latestReview.has(r.serviceUserId)) latestReview.set(r.serviceUserId, cur ?? null);
  }
  const latestSup = new Map<string, Date | null>();
  for (const s of supervisions) {
    const cur = latestSup.get(s.userId);
    if (s.nextReviewDate && (!cur || s.nextReviewDate > cur)) latestSup.set(s.userId, s.nextReviewDate);
    else if (!latestSup.has(s.userId)) latestSup.set(s.userId, cur ?? null);
  }
  const latestSpot = new Map<string, Date>();
  for (const s of spotChecks) { const cur = latestSpot.get(s.carerId); if (!cur || s.date > cur) latestSpot.set(s.carerId, s.date); }
  const expiredTrainingStaff = new Set(trainings.filter((t) => t.expiresAt && t.expiresAt < now()).map((t) => t.userId));

  // Build one check from a filter over clients.
  const clientCheck = (id: string, title: string, statement: string, fail: (c: typeof clients[number]) => boolean, redIfAny: boolean, detail: (n: number) => string, pop = clients): Check => {
    const failing = pop.filter(fail);
    const status: CheckStatus = failing.length === 0 ? 'green' : redIfAny ? 'red' : 'amber';
    return { id, title, statement, status, count: failing.length, total: pop.length, detail: detail(failing.length), items: failing.slice(0, CAP).map(clientLink) };
  };
  const staffCheck = (id: string, title: string, statement: string, fail: (s: typeof staff[number]) => boolean, redIfAny: boolean, detail: (n: number) => string): Check => {
    const failing = staff.filter(fail);
    const status: CheckStatus = failing.length === 0 ? 'green' : redIfAny ? 'red' : 'amber';
    return { id, title, statement, status, count: failing.length, total: staff.length, detail: detail(failing.length), items: failing.slice(0, CAP).map(staffLink) };
  };

  const slClients = clients.filter((c) => c.careType === 'SUPPORTED_LIVING');
  const missedMedClients = new Set(missedMedRows.map((m) => m.serviceUserId));

  const safe: Check[] = [
    {
      id: 'safeguarding_lead', title: 'Named safeguarding lead', statement: 'Safeguarding · Reg 13',
      status: sgSettings?.safeguardingLeadId ? 'green' : 'red', count: sgSettings?.safeguardingLeadId ? 0 : 1, total: 1,
      detail: sgSettings?.safeguardingLeadId
        ? 'A safeguarding lead is named for the service.'
        : 'No safeguarding lead is named. Set one in Settings.',
      items: sgSettings?.safeguardingLeadId ? [] : [{ id: 'lead', label: 'Name a safeguarding lead', link: '/settings' }],
    },
    {
      id: 'safeguarding_open', title: 'Safeguarding concerns progressed', statement: 'Safeguarding · Reg 13',
      status: stale.length ? 'amber' : 'green', count: stale.length, total: openConcerns.length,
      detail: stale.length
        ? `${stale.length} safeguarding concern(s) have been open for more than 30 days.`
        : openConcerns.length
          ? `${openConcerns.length} concern(s) open, all raised within the last 30 days.`
          : 'No safeguarding concerns are currently open.',
      items: concernItems(stale),
    },
    {
      id: 'safeguarding_referral_ref', title: 'Referrals evidenced', statement: 'Safeguarding · Reg 13',
      status: refMissing.length ? 'red' : 'green', count: refMissing.length, total: openConcerns.length,
      detail: refMissing.length
        ? `${refMissing.length} concern(s) are marked referred to the local authority with no reference number recorded.`
        : 'Every referred concern carries a local authority reference.',
      items: concernItems(refMissing),
    },
    clientCheck('allergies_recorded', 'Allergies recorded', 'Safe care and treatment · Reg 12',
      (c) => !c.allergies, true, (n) => n ? `${n} active client(s) have no allergy record. Blank is not the same as none - record "None known" where that is the answer.` : 'Every active client has an allergy record.'),
    clientCheck('resuscitation_status', 'Resuscitation status known', 'Planning for the future · Reg 9',
      (c) => !c.dnacprStatus, false, (n) => n ? `${n} active client(s) have no DNACPR or ReSPECT status recorded.` : 'Resuscitation status is recorded for every active client.'),
    clientCheck('risk_assessments', 'Risk assessments in place', 'Involving people to manage risks · Reg 12',
      (c) => (riskTypesBy.get(c.id)?.size ?? 0) === 0, true, (n) => n ? `${n} active client(s) have no risk assessment on record.` : 'Every active client has at least one risk assessment.'),
    {
      id: 'missed_meds', title: 'Medication administration', statement: 'Medicines optimisation · Reg 12',
      status: missedMedClients.size ? 'red' : 'green', count: missedMedClients.size, total: clients.length,
      detail: missedMedClients.size ? `Missed medications recorded for ${missedMedClients.size} client(s) in the last 30 days.` : 'No missed medications in the last 30 days.',
      items: [...missedMedClients].slice(0, CAP).map((id) => { const c = clients.find((x) => x.id === id); return c ? clientLink(c) : { id, label: 'Client' }; }),
    },
    staffCheck('training_expired', 'Mandatory training current', 'Safe and effective staffing · Reg 18',
      (s) => expiredTrainingStaff.has(s.id), true, (n) => n ? `${n} staff member(s) have expired training.` : 'No expired training on record.'),
  ];

  const effective: Check[] = [
    {
      id: 'capacity_best_interest', title: 'Best-interest decisions recorded', statement: 'Consent to care · Reg 11',
      status: noBestInterest.length ? 'red' : 'green', count: noBestInterest.length, total: lacking.length,
      detail: noBestInterest.length
        ? `${noBestInterest.length} assessment(s) found a person lacks capacity with no best-interest decision recorded. A finding on its own authorises nothing.`
        : lacking.length
          ? 'Every finding that someone lacks capacity has a best-interest decision behind it.'
          : 'No assessment has found that anyone lacks capacity.',
      items: noBestInterest.slice(0, CAP).map(capacityLink),
    },
    {
      id: 'capacity_review', title: 'Capacity assessments in date', statement: 'Consent to care · Reg 11',
      status: staleCapacity.length ? 'amber' : 'green', count: staleCapacity.length, total: capacityRows.length,
      detail: staleCapacity.length
        ? `${staleCapacity.length} capacity assessment(s) are past their review date. Capacity can return, and a stale finding gets used as though it has not.`
        : 'No capacity assessment is overdue a review.',
      items: staleCapacity.slice(0, CAP).map(capacityLink),
    },
    {
      id: 'capacity_deprivation', title: 'Deprivation of liberty raised', statement: 'Consent to care · Reg 11',
      status: dolUnraised.length ? 'red' : 'green', count: dolUnraised.length, total: capacityRows.filter((r) => r.deprivationConcern).length,
      detail: dolUnraised.length
        ? `${dolUnraised.length} arrangement(s) flagged as a possible deprivation of liberty have not been raised with anyone.`
        : 'Every possible deprivation of liberty has been raised.',
      items: dolUnraised.slice(0, CAP).map(capacityLink),
    },
    {
      id: 'legal_authority_evidence', title: 'Authority to decide evidenced', statement: 'Consent to care · Reg 11',
      status: authorityUnchecked.length ? 'amber' : 'green', count: authorityUnchecked.length, total: authorities.length,
      detail: authorityUnchecked.length
        ? `${authorityUnchecked.length} recorded authority(ies) are unregistered, or nobody has recorded seeing the document. An unregistered LPA confers nothing.`
        : authorities.length
          ? 'Every recorded authority has been seen and, where it applies, registered.'
          : 'No attorneys, deputies or advance decisions recorded.',
      items: authorityUnchecked.slice(0, CAP).map(authorityLink),
    },
    clientCheck('care_plan_missing', 'Care plan in place', 'Assessing needs · Reg 9',
      (c) => !carePlanBy.has(c.id), true, (n) => n ? `${n} active client(s) have no care plan.` : 'Every active client has a care plan.'),
    clientCheck('care_plan_review', 'Care plan reviews up to date', 'Assessing needs / Monitoring outcomes · Reg 9',
      (c) => { const p = carePlanBy.get(c.id); return !!p?.reviewDate && p.reviewDate < now(); }, false, (n) => n ? `${n} care plan review(s) are overdue.` : 'No overdue care plan reviews.'),
    clientCheck('consent_contract', 'Consent / contract of care', 'Consent to care and treatment · Reg 11',
      (c) => !hasType(c.id, 'CONTRACT_OF_CARE'), false, (n) => n ? `${n} active client(s) have no contract of care on file.` : 'Every active client has a contract of care.'),
    clientCheck('review_overdue', 'Service reviews up to date', 'Monitoring and improving outcomes · Reg 17',
      (c) => { const d = latestReview.get(c.id); return !!d && d < now(); }, false, (n) => n ? `${n} service review(s) are overdue.` : 'No overdue service reviews.'),
  ];

  const caring: Check[] = [
    clientCheck('one_page_profile', 'Person-centred profile', 'Treating people as individuals · Reg 9',
      (c) => !hasType(c.id, 'ONE_PAGE_PROFILE'), false, (n) => n ? `${n} active client(s) have no One-Page Profile.` : 'Every active client has a One-Page Profile.'),
    clientCheck('likes_dislikes', 'Likes & dislikes recorded', 'Independence, choice and control · Reg 9',
      (c) => !likesSet.has(c.id), false, (n) => n ? `${n} active client(s) have no likes & dislikes recorded.` : 'Likes & dislikes recorded for every active client.'),
  ];

  const responsive: Check[] = [
    clientCheck('sl_support_plan', 'Supported-living support plan', 'Person centred care · Reg 9',
      (c) => !hasType(c.id, 'SL_SUPPORT_PLAN'), false, (n) => n ? `${n} supported-living client(s) have no support plan.` : 'Every supported-living client has a support plan.', slClients),
    {
      id: 'complaints', title: 'Complaints log', statement: 'Listening to and involving people · Reg 16',
      status: 'green', count: complaints.length, total: complaints.length,
      detail: complaints.length
        ? `${complaints.length} complaint(s) and ${compliments.length} compliment(s) recorded in the last 12 months.`
        : `No complaints recorded in the last 12 months. ${compliments.length} compliment(s) on record.`,
      items: [],
    },
    {
      id: 'complaints_acknowledged', title: 'Complaints acknowledged promptly', statement: 'Listening to and involving people · Reg 16',
      status: ackLate.length ? 'red' : 'green', count: ackLate.length, total: open.length,
      detail: ackLate.length
        ? `${ackLate.length} open complaint(s) have gone more than ${ACK_DAYS} days without being acknowledged.`
        : 'Every open complaint has been acknowledged in time.',
      items: ackLate.slice(0, CAP).map(complaintLabel),
    },
    {
      id: 'complaints_responded', title: 'Complaints answered', statement: 'Listening to and involving people · Reg 16',
      status: respLate.length ? 'red' : 'green', count: respLate.length, total: open.length,
      detail: respLate.length
        ? `${respLate.length} complaint(s) have been open more than ${RESPONSE_DAYS} days with no response recorded.`
        : 'No complaint has been open longer than ' + RESPONSE_DAYS + ' days without a response.',
      items: respLate.slice(0, CAP).map(complaintLabel),
    },
    {
      id: 'complaints_ombudsman', title: 'Right to escalate explained', statement: 'Listening to and involving people · Reg 16',
      status: noSignpost.length ? 'amber' : 'green', count: noSignpost.length, total: complaints.length,
      detail: noSignpost.length
        ? `${noSignpost.length} closed complaint(s) were not upheld in full with no record that the person was told they could go to the Ombudsman.`
        : 'Everyone whose complaint was not upheld in full was told they could take it further.',
      items: noSignpost.slice(0, CAP).map(complaintLabel),
    },
  ];

  const wellled: Check[] = [
    {
      id: 'speak_up', title: 'Freedom to speak up', statement: 'Freedom to speak up · Well-led',
      status: openDisclosures.filter((c) => c.raisedAt < daysAgo(30)).length ? 'amber' : 'green',
      count: openDisclosures.filter((c) => c.raisedAt < daysAgo(30)).length, total: openDisclosures.length,
      detail: openDisclosures.length
        ? `${openDisclosures.length} whistleblowing disclosure(s) open.`
        : 'No whistleblowing disclosures are currently open.',
      items: openDisclosures.filter((c) => c.raisedAt < daysAgo(30)).slice(0, CAP)
        .map((c) => ({ id: c.id, label: 'Open more than 30 days', link: '/safeguarding' })),
    },
    {
      id: 'unassigned_shifts', title: 'Upcoming visits covered', statement: 'Governance / staffing · Reg 17 & 18',
      status: unassigned > 0 ? 'amber' : 'green', count: unassigned, total: 0,
      detail: unassigned > 0 ? `${unassigned} visit(s) in the next 7 days have no carer assigned.` : 'All visits in the next 7 days are covered.',
      items: unassigned > 0 ? [{ id: 'schedule', label: `${unassigned} unassigned visit(s) — open the schedule`, link: '/schedule' }] : [],
    },
    staffCheck('supervision_overdue', 'Staff supervisions up to date', 'Safe and effective staffing · Reg 18',
      (s) => { const d = latestSup.get(s.id); return d === undefined || d === null || d < now(); }, true,
      (n) => n ? `${n} staff member(s) are overdue (or have no) supervision.` : 'All staff supervisions are up to date.'),
    {
      id: 'audit_programme', title: 'Care audits carried out', statement: 'Governance · Reg 17',
      status: audits.length === 0 ? 'red' : 'green', count: audits.length, total: audits.length,
      detail: audits.length
        ? `${audits.length} audit(s) recorded, across ${latestAudits.length} area(s).`
        : 'No audits recorded. Reg 17 asks for regular checks on care plans, MAR charts, daily notes, recruitment files and call monitoring.',
      items: [],
    },
    {
      id: 'audit_due', title: 'Audits in date', statement: 'Governance · Reg 17',
      status: auditsDue.length ? 'amber' : 'green', count: auditsDue.length, total: latestAudits.length,
      detail: auditsDue.length
        ? `${auditsDue.length} audit(s) are past the date they were due to run again.`
        : latestAudits.length
          ? 'Every audit area is within its schedule.'
          : 'No audit schedule set.',
      items: auditsDue.slice(0, CAP).map(auditLink),
    },
    {
      id: 'improvement_actions', title: 'Improvement actions on time', statement: 'Governance · Reg 17',
      status: actionsOverdue.length ? 'red' : 'green', count: actionsOverdue.length, total: openActions.length,
      detail: actionsOverdue.length
        ? `${actionsOverdue.length} improvement action(s) are past their due date.`
        : openActions.length
          ? `${openActions.length} action(s) open, none overdue.`
          : 'No improvement actions outstanding.',
      items: actionsOverdue.slice(0, CAP).map(actionLink),
    },
    {
      id: 'policy_library', title: 'Policy library in place', statement: 'Governance · Reg 17',
      status: policies.length === 0 ? 'red' : 'green', count: policies.length, total: policies.length,
      detail: policies.length
        ? `${policies.length} published polic${policies.length === 1 ? 'y' : 'ies'}.`
        : 'No published policies. Reg 17 asks for the policies that govern the service, with a version and a review date.',
      items: [],
    },
    {
      id: 'policy_review', title: 'Policies in date', statement: 'Governance · Reg 17',
      status: stalePolicies.length ? 'amber' : 'green', count: stalePolicies.length, total: policies.length,
      detail: stalePolicies.length
        ? `${stalePolicies.length} polic${stalePolicies.length === 1 ? 'y is' : 'ies are'} past the review date.`
        : 'Every published policy is within its review date.',
      items: stalePolicies.slice(0, CAP).map(policyLink),
    },
    {
      id: 'policy_signed', title: 'Policies read and signed', statement: 'Governance · Reg 17',
      status: policyGaps.length ? 'amber' : 'green', count: policyGaps.length, total: policies.filter((p) => p.requiresAck).length,
      detail: policyGaps.length
        ? `${policyGaps.length} polic${policyGaps.length === 1 ? 'y has' : 'ies have'} staff who have not signed the current version.`
        : policies.length
          ? 'Everyone has signed the current version of every policy that applies to them.'
          : 'No policies to sign.',
      items: policyGaps.slice(0, CAP).map(policyLink),
    },
    staffCheck('spot_check_overdue', 'Spot checks up to date', 'Governance · Reg 17',
      (s) => { const d = latestSpot.get(s.id); return !d || d < daysAgo(180); }, false,
      (n) => n ? `${n} staff member(s) have had no spot check in the last 6 months.` : 'All staff have a recent spot check.'),
    {
      id: 'incidents', title: 'Accidents & incidents register', statement: 'Learning culture · Reg 12 & 17',
      status: 'green', count: incidents.length, total: incidents.length,
      detail: incidents.length
        ? `${incidents.length} accident(s), incident(s) and near miss(es) recorded in the last 12 months.`
        : 'No incidents recorded in the last 12 months.',
      items: [],
    },
    {
      id: 'candour_decision', title: 'Duty of candour considered', statement: 'Duty of candour · Reg 20',
      status: candourUndecided.length ? 'amber' : 'green',
      count: candourUndecided.length, total: candourRelevant.length,
      detail: candourUndecided.length
        ? `${candourUndecided.length} incident(s) in the last 12 months have no duty of candour decision recorded. Deciding it does not apply is also an answer.`
        : candourRelevant.length
          ? 'Duty of candour has been considered on every incident in the last 12 months.'
          : 'No incidents in the last 12 months needed a duty of candour decision.',
      items: candourUndecided.slice(0, CAP).map(incidentLabel),
    },
    {
      id: 'candour_done', title: 'Duty of candour discharged', statement: 'Duty of candour · Reg 20',
      status: candourOutstanding.length ? 'red' : 'green',
      count: candourOutstanding.length, total: incidents.filter((i) => i.candourRequired === true).length,
      detail: candourOutstanding.length
        ? `${candourOutstanding.length} incident(s) where candour applies are missing the notification or the written follow-up.`
        : 'Every incident where candour applies has been notified and followed up in writing.',
      items: candourOutstanding.slice(0, CAP).map(incidentLabel),
    },
  ];

  const blocks: Record<string, Check[]> = { safe, effective, caring, responsive, wellled };
  const keyQuestions: KeyQuestionBlock[] = KEY_QUESTIONS.map((kq) => ({ key: kq.key, label: kq.label, checks: blocks[kq.key], score: scoreOf(blocks[kq.key]) }));
  const overallScore = Math.round(keyQuestions.reduce((s, k) => s + k.score, 0) / keyQuestions.length);

  // Manual self-assessment (stored per company).
  const settings = await prisma.orgSettings.findFirst();
  let selfAssessment: Record<string, unknown> = {};
  if (settings?.cqcSelfAssessment) { try { selfAssessment = JSON.parse(settings.cqcSelfAssessment); } catch { selfAssessment = {}; } }

  return { generatedAt: new Date().toISOString(), overallScore, keyQuestions, selfAssessment };
}

export async function getReadiness(_req: AuthRequest, res: Response) {
  res.json(await computeReadiness());
}

export async function saveSelfAssessment(req: AuthRequest, res: Response) {
  const companyId = getTenant()?.companyId;
  if (!companyId) return res.status(400).json({ error: 'No company in scope' });
  let json = '{}';
  const raw = (req.body as { selfAssessment?: unknown }).selfAssessment;
  if (raw !== undefined) {
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    try { JSON.parse(str); json = str; } catch { return res.status(400).json({ error: 'selfAssessment must be valid JSON' }); }
  }
  await prisma.orgSettings.upsert({ where: { companyId }, update: { cqcSelfAssessment: json }, create: { companyId, cqcSelfAssessment: json } });
  res.json({ ok: true });
}
