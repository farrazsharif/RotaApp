import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet } from '../api.js';
import { Format, ResponseFormat, daysUntil, fitToLimit, fmtDate, result } from '../shared.js';

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  active: boolean;
  staffType?: string | null;
  staffRole?: string | null;
}

interface ComplianceRow {
  userId: string;
  complete: boolean;
  present: number;
  total: number;
  missing: string[];
}

interface TrainingRow {
  id: string;
  userId: string;
  course: string;
  date: string;
  expiresAt: string | null;
}

async function activeStaff(signal: AbortSignal): Promise<StaffUser[]> {
  const users = await apiGet<StaffUser[]>('users', { active: 'true' }, signal);
  return users.filter((u) => u.active);
}

const nameOf = (u?: StaffUser) => (u ? `${u.firstName} ${u.lastName}` : 'Unknown staff member');

export function registerStaffTools(server: McpServer) {
  server.registerTool(
    'caremid_list_staff',
    {
      title: 'List staff',
      description:
        'Active staff in the company: name, email, role, and whether they are local or overseas. ' +
        'Use this to resolve a person to their Caremid id before calling another tool, or to check whether ' +
        'a name found elsewhere (a document, a rota) belongs to anyone currently employed. ' +
        'Returns only active accounts; leavers are excluded.',
      inputSchema: z.strictObject({
        search: z
          .string()
          .min(2)
          .max(100)
          .optional()
          .describe('Case-insensitive match against first name, last name or email. Omit to list everyone.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ search, response_format }, ctx) => {
      const users = await activeStaff(ctx.mcpReq.signal);
      const q = search?.toLowerCase();
      const matched = q
        ? users.filter((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q))
        : users;

      const rows = matched.map((u) => ({
        id: u.id,
        name: nameOf(u),
        email: u.email,
        role: u.role,
        staff_type: u.staffType ?? null,
      }));

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `# Staff (${rs.length}${omittedHint(rows.length, rs.length)})`,
          '',
          ...rs.map((r) => `- **${r.name}** — ${r.role}${r.staff_type ? ` · ${r.staff_type}` : ''} · ${r.email} · \`${r.id}\``),
        ].join('\n'),
      );

      return result(response_format as Format, text, { total: rows.length, count: kept.length, omitted, staff: kept });
    },
  );

  server.registerTool(
    'caremid_staff_compliance',
    {
      title: 'Staff file compliance',
      description:
        'Who is missing what from their staff file, against the staff-file requirements configured in Caremid ' +
        '(CQC Regulation 19). Each person comes back with how many requirements are met out of how many apply ' +
        'to them — requirements differ for local vs overseas staff and care vs office roles — and the names of ' +
        'the ones still outstanding. ' +
        'Use this for "whose file is incomplete" or "who still needs a reference". ' +
        'For whether a document has lapsed rather than is absent, call caremid_expiring_training. ' +
        'Example: { only_incomplete: true } for just the people with gaps.',
      inputSchema: z.strictObject({
        only_incomplete: z
          .boolean()
          .default(true)
          .describe('Return only staff with at least one missing requirement. Set false to include complete files too.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ only_incomplete, response_format }, ctx) => {
      const [users, compliance] = await Promise.all([
        activeStaff(ctx.mcpReq.signal),
        apiGet<ComplianceRow[]>('users/compliance', {}, ctx.mcpReq.signal),
      ]);
      const byId = new Map(users.map((u) => [u.id, u]));

      const rows = compliance
        // The compliance endpoint and the staff list are scoped the same way,
        // but guard anyway: a row with no matching user is not reportable.
        .filter((c) => byId.has(c.userId))
        .filter((c) => (only_incomplete ? !c.complete : true))
        .map((c) => ({
          user_id: c.userId,
          name: nameOf(byId.get(c.userId)),
          complete: c.complete,
          present: c.present,
          total: c.total,
          missing: c.missing,
        }))
        .sort((a, b) => a.missing.length - b.missing.length || a.name.localeCompare(b.name));

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `# Staff file compliance`,
          `${rows.length} ${only_incomplete ? 'with gaps' : 'staff'}${omittedHint(rows.length, rs.length)}.`,
          '',
          ...rs.map(
            (r) =>
              `- **${r.name}** — ${r.present}/${r.total}${r.missing.length ? `\n  Missing: ${r.missing.join(', ')}` : ' · complete'}`,
          ),
        ].join('\n'),
      );

      return result(response_format as Format, text, { total: rows.length, count: kept.length, omitted, staff: kept });
    },
  );

  server.registerTool(
    'caremid_expiring_training',
    {
      title: 'Expiring training',
      description:
        'Training certificates that have lapsed or are about to. ' +
        'Only the most recent record per person per course counts, so a course that has since been refreshed ' +
        'does not keep showing as expired from its old certificate. ' +
        'Use this for "whose training is out of date" or "what needs renewing before the end of the quarter". ' +
        'Note this covers TRAINING only — expiry dates on uploaded documents such as passports and visas are ' +
        'held separately and are not returned here. ' +
        'Example: { days: 90 } for everything lapsing within the next three months.',
      inputSchema: z.strictObject({
        days: z
          .number()
          .int()
          .min(0)
          .max(730)
          .default(60)
          .describe('How far ahead to look, in days. 0 returns only what has already expired.'),
        include_expired: z
          .boolean()
          .default(true)
          .describe('Include certificates that have already lapsed, not just upcoming ones.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ days, include_expired, response_format }, ctx) => {
      const [users, training] = await Promise.all([
        activeStaff(ctx.mcpReq.signal),
        apiGet<TrainingRow[]>('training', {}, ctx.mcpReq.signal),
      ]);
      const byId = new Map(users.map((u) => [u.id, u]));

      // Latest record per (person, course). Without this, an old certificate
      // reports as expired even though the course has since been retaken.
      const latest = new Map<string, TrainingRow>();
      for (const t of training) {
        const key = `${t.userId}|${t.course.trim().toLowerCase()}`;
        const held = latest.get(key);
        if (!held || new Date(t.date) > new Date(held.date)) latest.set(key, t);
      }

      const rows = [...latest.values()]
        .filter((t) => t.expiresAt && byId.has(t.userId))
        .map((t) => ({ ...t, left: daysUntil(t.expiresAt!) }))
        .filter((t) => (t.left < 0 ? include_expired : t.left <= days))
        .map((t) => ({
          user_id: t.userId,
          name: nameOf(byId.get(t.userId)),
          course: t.course,
          expires_at: t.expiresAt,
          days_left: t.left,
          status: t.left < 0 ? ('expired' as const) : ('expiring' as const),
        }))
        .sort((a, b) => a.days_left - b.days_left);

      const expired = rows.filter((r) => r.status === 'expired').length;

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `# Training expiry`,
          `${expired} expired, ${rows.length - expired} expiring within ${days} day${days === 1 ? '' : 's'}${omittedHint(rows.length, rs.length)}.`,
          '',
          ...rs.map(
            (r) =>
              `- ${r.status === 'expired' ? '🔴' : '🟠'} **${r.name}** — ${r.course} — ${fmtDate(r.expires_at)} ${
                r.days_left < 0 ? `(expired ${Math.abs(r.days_left)}d ago)` : `(${r.days_left}d left)`
              }`,
          ),
        ].join('\n'),
      );

      return result(response_format as Format, text, {
        total: rows.length,
        count: kept.length,
        omitted,
        expired_count: expired,
        training: kept,
      });
    },
  );
}

function omittedHint(total: number, shown: number): string {
  return total > shown ? `, showing ${shown} — ${total - shown} omitted to stay within the response limit` : '';
}
