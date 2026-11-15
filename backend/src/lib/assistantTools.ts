/**
 * The tools the in-app assistant can call.
 *
 * Every one of them runs as the signed-in user, not as a service account:
 * company scope comes from the tenant context the request is already inside,
 * site scope from the same `staffScopeOr` / `shiftScopeWhere` helpers the
 * normal endpoints use, and capability checks from that user's own role.
 *
 * That is the whole security model. A field supervisor asking the assistant
 * "who is unassigned next week" must see exactly what the Schedule page would
 * show them and no more — if the assistant ran as an admin service account, it
 * would quietly become a way to read around site scoping.
 *
 * Read-only by construction: there are no write tools here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { AuthRequest } from '../middleware/auth';
import { isScoped, staffScopeOr, shiftScopeWhere } from './scope';
import { userHasPermission } from '../middleware/permissions';
import { computeReadiness } from '../controllers/cqcController';
import { evaluateCompliance, parseRequirements, parseWaivers } from './staffCompliance';
import { docCountsByUser } from '../controllers/userController';
import { loadOrgSettings } from '../controllers/settingsController';

const CAP = 100; // rows per tool result — keeps a turn's context sane

function daysUntil(d: Date): number {
  const a = new Date(d);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

async function scopedStaff(req: AuthRequest) {
  const where: Record<string, unknown> = { role: { not: 'FAMILY_MEMBER' }, active: true };
  if (isScoped(req.user)) where.OR = staffScopeOr(req.user);
  return prisma.user.findMany({
    where,
    select: {
      id: true, firstName: true, lastName: true, photo: true, fitForWork: true,
      emergencyContactName: true, staffType: true, staffRole: true,
      rightToWorkCheckedAt: true, complianceWaivers: true,
    },
    orderBy: [{ firstName: 'asc' }],
  });
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'cqc_readiness',
    description:
      'The full CQC evidence sweep for the company, grouped by key question (Safe, Effective, Caring, Responsive, Well-led). ' +
      'Each check names the regulation behind it, how many records fail, and which ones. Covers care plans and review dates, ' +
      'risk assessments, likes and dislikes, client reviews, staff supervisions, spot checks, expired training, missed ' +
      'medication in the last 30 days, and unassigned visits in the next 7 days. ' +
      'Use for open-ended questions about compliance or inspection readiness. ' +
      'For who is missing which document from their file, use staff_compliance instead.',
    input_schema: {
      type: 'object',
      properties: {
        only_failing: {
          type: 'boolean',
          description: 'Only return red and amber checks. Default true. Set false to include what is passing.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'staff_compliance',
    description:
      'Who is missing what from their staff file, against the staff-file requirements configured for this company ' +
      '(CQC Regulation 19). Requirements differ for local vs overseas staff and care vs office roles, so each person ' +
      'comes back with how many of their own applicable requirements are met and the names of those outstanding. ' +
      'Use for "whose file is incomplete" or "who still needs a reference".',
    input_schema: {
      type: 'object',
      properties: {
        only_incomplete: {
          type: 'boolean',
          description: 'Only return staff with at least one missing requirement. Default true.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'expiring_training',
    description:
      'Training certificates that have lapsed or are about to. Only the most recent certificate per person per course ' +
      'counts, so a course since retaken does not keep reporting as expired from its old record. ' +
      'Covers TRAINING only — expiry dates recorded on uploaded documents such as passports and visas are held ' +
      'separately and are not returned here.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          description: 'How far ahead to look, in days. Default 60. Use 0 for only what has already expired.',
          minimum: 0,
          maximum: 730,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'unstaffed_visits',
    description:
      'Visits in a date range that do not have all the carers they need — either nobody at all, or fewer than the ' +
      'visit calls for (a double-up with one carer). Supported Living house visits are counted by their resident ' +
      'slots rather than a single carer. Cancelled visits are excluded. ' +
      'Dates are YYYY-MM-DD. Use for "what is still unassigned next week".',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'First date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Last date, YYYY-MM-DD.' },
        only_empty: {
          type: 'boolean',
          description: 'True returns only visits with no carer at all. Default false, which also returns short-staffed ones.',
        },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
];

type ToolInput = Record<string, unknown>;

/**
 * Runs one tool. A refusal is returned as text rather than thrown: the model
 * should be able to tell the user "you do not have access to that" and carry
 * on, instead of the whole turn failing.
 */
export async function runAssistantTool(req: AuthRequest, name: string, input: ToolInput): Promise<string> {
  switch (name) {
    case 'cqc_readiness': {
      if (!(await userHasPermission(req, 'manage_cqc'))) {
        return 'Not permitted: this account cannot view the CQC dashboard. Tell the user their role does not include it.';
      }
      const data = await computeReadiness();
      const onlyFailing = input.only_failing !== false;
      const blocks = data.keyQuestions.map((kq) => ({
        label: kq.label,
        score: kq.score,
        checks: kq.checks
          .filter((c) => (onlyFailing ? c.status === 'red' || c.status === 'amber' : true))
          .map((c) => ({
            title: c.title,
            statement: c.statement,
            status: c.status,
            failing: c.count,
            of: c.total,
            detail: c.detail,
            who: c.items.map((i) => i.label),
          })),
      }));
      return JSON.stringify({ overall_score: data.overallScore, key_questions: blocks });
    }

    case 'staff_compliance': {
      if (!(await userHasPermission(req, 'manage_staff'))) {
        return 'Not permitted: this account cannot view staff files. Tell the user their role does not include it.';
      }
      const staff = await scopedStaff(req);
      const ids = staff.map((u) => u.id);
      const [counts, training, settings] = await Promise.all([
        docCountsByUser(ids),
        prisma.training.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
        loadOrgSettings(),
      ]);
      const requirements = parseRequirements(settings.staffFileRequirements);
      const trainCount = new Map(training.map((t) => [t.userId, t._count._all]));

      const rows = staff
        .map((u) => {
          const r = evaluateCompliance(
            {
              photo: u.photo,
              fitForWork: u.fitForWork,
              emergencyContactName: u.emergencyContactName,
              docCounts: counts.get(u.id) || {},
              trainingCount: trainCount.get(u.id) || 0,
              staffType: (u.staffType as 'LOCAL' | 'OVERSEAS') || 'LOCAL',
              staffRole: (u.staffRole as 'CARE' | 'OFFICE') || 'CARE',
              rightToWorkCheckedAt: u.rightToWorkCheckedAt,
              waivers: parseWaivers(u.complianceWaivers),
            },
            requirements,
          );
          return { name: `${u.firstName} ${u.lastName}`, complete: r.complete, present: r.present, of: r.total, missing: r.missing };
        })
        .filter((r) => (input.only_incomplete !== false ? !r.complete : true))
        .sort((a, b) => a.missing.length - b.missing.length);

      return JSON.stringify({ total: rows.length, staff: rows.slice(0, CAP) });
    }

    case 'expiring_training': {
      if (!(await userHasPermission(req, 'manage_staff'))) {
        return 'Not permitted: this account cannot view staff training records.';
      }
      const days = typeof input.days === 'number' ? input.days : 60;
      const staff = await scopedStaff(req);
      const byId = new Map(staff.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
      const records = await prisma.training.findMany({
        where: { userId: { in: [...byId.keys()] } },
        select: { userId: true, course: true, date: true, expiresAt: true },
      });

      // Latest certificate per person per course — otherwise a course since
      // retaken keeps reporting as expired from the superseded record.
      const latest = new Map<string, (typeof records)[number]>();
      for (const t of records) {
        const key = `${t.userId}|${t.course.trim().toLowerCase()}`;
        const held = latest.get(key);
        if (!held || t.date > held.date) latest.set(key, t);
      }

      const rows = [...latest.values()]
        .filter((t) => t.expiresAt)
        .map((t) => ({ name: byId.get(t.userId)!, course: t.course, expires: t.expiresAt!.toISOString().slice(0, 10), days_left: daysUntil(t.expiresAt!) }))
        .filter((t) => t.days_left <= days)
        .sort((a, b) => a.days_left - b.days_left);

      return JSON.stringify({
        expired: rows.filter((r) => r.days_left < 0).length,
        expiring_within_days: days,
        total: rows.length,
        training: rows.slice(0, CAP),
      });
    }

    case 'unstaffed_visits': {
      if (!(await userHasPermission(req, 'manage_schedule'))) {
        return 'Not permitted: this account cannot view the schedule.';
      }
      const from = String(input.from || '');
      const to = String(input.to || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return 'Invalid dates. Both from and to must be YYYY-MM-DD.';
      }
      if (new Date(from) > new Date(to)) return `Invalid range: from (${from}) is after to (${to}).`;

      const shifts = await prisma.shift.findMany({
        where: {
          date: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) },
          status: { not: 'CANCELLED' },
          ...shiftScopeWhere(req.user),
        },
        select: {
          id: true, date: true, startTime: true, endTime: true, visitName: true, cover: true,
          userId: true, siteId: true, published: true,
          site: { select: { name: true } },
          serviceUser: { select: { firstName: true, lastName: true } },
          coverCarers: { select: { id: true } },
          residentSlots: { select: { userId: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });

      const rows = shifts
        .map((s) => {
          // A house visit's resident slots ARE its assignment; userId stays null.
          const assigned = s.siteId ? s.residentSlots.filter((r) => r.userId).length : (s.userId ? 1 : 0) + s.coverCarers.length;
          const needed = s.siteId ? s.residentSlots.length : s.cover || 1;
          return { s, assigned, needed };
        })
        .filter(({ assigned, needed }) => (input.only_empty === true ? assigned === 0 : assigned < needed))
        .map(({ s, assigned, needed }) => ({
          date: s.date.toISOString().slice(0, 10),
          time: `${s.startTime}-${s.endTime}`,
          who_for: s.siteId ? s.site?.name || 'House visit' : s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Unknown client',
          visit: s.visitName || null,
          assigned,
          needed,
          draft: s.published === false,
        }));

      return JSON.stringify({
        from,
        to,
        total: rows.length,
        with_nobody: rows.filter((r) => r.assigned === 0).length,
        visits: rows.slice(0, CAP),
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
