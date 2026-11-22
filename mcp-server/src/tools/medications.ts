import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet } from '../api.js';
import { Format, ResponseFormat, fmtDate, result } from '../shared.js';

/**
 * Reading the exceptions on a MAR chart: every dose that was not given, and
 * why - as far as the record says.
 *
 * Read-only on purpose. Editing a medication record is editing a legal
 * document, and the reason a dose was not given is almost never written down
 * anywhere this server can see. "The client was in hospital" IS knowable,
 * because the office records admissions; "the client was out" is not, and the
 * difference between those two is the whole point of looking.
 */

const EXCEPTION_STATUSES = ['MISSED', 'REFUSED', 'NOT_NEEDED', 'CANCELLED', 'NOT_AT_HOME', 'HOSPITAL'] as const;

interface Administration {
  id: string;
  status: string;
  scheduledFor: string;
  recordedAt: string;
  note: string | null;
  serviceUserId: string;
  serviceUser: { id: string; firstName: string; lastName: string } | null;
  medication: { id: string; name: string; dose: string | null } | null;
  user: { id: string; firstName: string; lastName: string } | null;
}

interface AwayPeriod {
  serviceUserId: string;
  startAt: string;
  endAt: string;
  type: string; // HOSPITAL | RESPITE
}

const clientName = (a: Administration) =>
  a.serviceUser ? `${a.serviceUser.firstName} ${a.serviceUser.lastName}`.trim() : 'Unknown client';

/**
 * A dose's scheduledFor is a UK wall clock encoded as UTC; an away period's
 * bounds are real instants. Comparing them raw is an hour out for the seven
 * months the UK is on BST, which at the edges of an admission is the
 * difference between "in hospital" and "nobody gave it".
 */
function londonSlot(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), 0);
}

/** The dose slot itself is already in that encoding - read it as written. */
const doseSlot = (iso: string): number => {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0);
};

export function registerMedicationTools(server: McpServer) {
  server.registerTool(
    'caremid_medication_exceptions',
    {
      title: 'Doses that were not given, and whether the client was away',
      description:
        'Every medication dose in a date range recorded as anything other than given - missed, refused, not ' +
        'required, cancelled, not at home, in hospital - with the client, the dose, the carer who recorded it, ' +
        'and any note. For each one it also says whether the office had recorded the client as being in ' +
        'hospital or away on respite at that moment, which is the question worth asking of a missed dose: a ' +
        'dose that fell due on a hospital ward was never the service\'s to give. Read-only - it changes ' +
        'nothing. Defaults to MISSED, which is the only status counted as a missed medication. Example: ' +
        '{ from: "2026-01-01", to: "2026-11-22" } for every missed dose this year.',
      inputSchema: z.strictObject({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First date to include, yyyy-mm-dd'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last date to include, yyyy-mm-dd'),
        status: z
          .enum(EXCEPTION_STATUSES)
          .default('MISSED')
          .describe('Which recorded status to list. MISSED is the one counted against the service.'),
        client: z.string().min(2).max(120).optional().describe('Limit to one client, by full name or Caremid id'),
        detail: z
          .boolean()
          .default(false)
          .describe('Also list every dose, not just the per-client totals. Capped at 300 rows.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      if (args.to < args.from) throw new Error('to must not be before from.');

      const rows = (
        await apiGet<Administration[]>(
          'medications/administrations',
          { startDate: args.from, endDate: args.to, status: args.status },
          signal,
        )
      ).filter((a) => a.status === args.status);

      if (!args.client && !rows.length) {
        return result(
          args.response_format as Format,
          `No dose between ${args.from} and ${args.to} is recorded as ${args.status}.`,
          { status: args.status, from: args.from, to: args.to, total: 0, clients: [] },
        );
      }

      const wanted = args.client?.trim().toLowerCase();
      const scoped = wanted
        ? rows.filter((a) => clientName(a).toLowerCase() === wanted || a.serviceUserId === args.client)
        : rows;
      if (wanted && !scoped.length) {
        throw new Error(`No ${args.status} dose for "${args.client}" between ${args.from} and ${args.to}.`);
      }

      // Away periods, one call per affected client. Only the clients that
      // actually appear, so a quiet month is a handful of requests.
      const ids = [...new Set(scoped.map((a) => a.serviceUserId))];
      const away = new Map<string, AwayPeriod[]>();
      for (let i = 0; i < ids.length; i += 6) {
        const batch = await Promise.all(
          ids.slice(i, i + 6).map(async (id) => [id, await apiGet<AwayPeriod[]>('respite', { serviceUserId: id }, signal)] as const),
        );
        for (const [id, periods] of batch) away.set(id, periods);
      }

      const coverFor = (a: Administration): string | null => {
        const at = doseSlot(a.scheduledFor);
        const hit = (away.get(a.serviceUserId) ?? []).find(
          (p) => at >= londonSlot(p.startAt) && at < londonSlot(p.endAt),
        );
        return hit ? hit.type : null;
      };

      type Group = { name: string; id: string; total: number; hospital: number; respite: number; open: number; notes: number; first: string; last: string };
      const groups = new Map<string, Group>();
      const classified = scoped.map((a) => ({ a, cover: coverFor(a) }));

      for (const { a, cover } of classified) {
        const key = a.serviceUserId;
        const g = groups.get(key) ?? {
          name: clientName(a), id: key, total: 0, hospital: 0, respite: 0, open: 0, notes: 0,
          first: a.scheduledFor, last: a.scheduledFor,
        };
        g.total += 1;
        if (cover === 'HOSPITAL') g.hospital += 1;
        else if (cover === 'RESPITE') g.respite += 1;
        else g.open += 1;
        if (a.note && a.note.trim()) g.notes += 1;
        if (a.scheduledFor < g.first) g.first = a.scheduledFor;
        if (a.scheduledFor > g.last) g.last = a.scheduledFor;
        groups.set(key, g);
      }

      const ranked = [...groups.values()].sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
      const totals = ranked.reduce(
        (t, g) => ({ total: t.total + g.total, hospital: t.hospital + g.hospital, respite: t.respite + g.respite, open: t.open + g.open, notes: t.notes + g.notes }),
        { total: 0, hospital: 0, respite: 0, open: 0, notes: 0 },
      );

      const lines = [
        `**${totals.total}** dose${totals.total === 1 ? '' : 's'} recorded as **${args.status}** between ` +
          `${args.from} and ${args.to}, across ${ranked.length} client${ranked.length === 1 ? '' : 's'}.`,
        '',
        `- **${totals.hospital}** fell due while the client was recorded as in hospital`,
        `- **${totals.respite}** while they were away on respite`,
        `- **${totals.open}** with no away period recorded — the record does not say why`,
        `- **${totals.notes}** carry a note`,
        '',
        '| Client | Total | In hospital | On respite | Unexplained | With a note | First | Last |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...ranked.map(
          (g) =>
            `| ${g.name} | ${g.total} | ${g.hospital} | ${g.respite} | ${g.open} | ${g.notes} | ` +
            `${fmtDate(g.first)} | ${fmtDate(g.last)} |`,
        ),
      ];

      const detail = classified
        .sort((x, y) => x.a.scheduledFor.localeCompare(y.a.scheduledFor))
        .slice(0, 300)
        .map(({ a, cover }) => ({
          id: a.id,
          client: clientName(a),
          client_id: a.serviceUserId,
          due: a.scheduledFor,
          medication: a.medication ? `${a.medication.name}${a.medication.dose ? ` ${a.medication.dose}` : ''}` : null,
          recorded_by: a.user ? `${a.user.firstName} ${a.user.lastName}` : null,
          note: a.note,
          away_at_the_time: cover,
        }));

      if (args.detail) {
        lines.push(
          '',
          `**Every dose** (${Math.min(classified.length, 300)} of ${classified.length})`,
          '',
          '| Due | Client | Medication | Recorded by | Away? | Note |',
          '| --- | --- | --- | --- | --- | --- |',
          ...detail.map(
            (d) =>
              `| ${fmtDate(d.due)} ${d.due.slice(11, 16)} | ${d.client} | ${d.medication ?? '—'} | ` +
              `${d.recorded_by ?? '—'} | ${d.away_at_the_time ?? '—'} | ${(d.note ?? '').replace(/\|/g, '/') || '—'} |`,
          ),
        );
      }

      return result(args.response_format as Format, lines.join('\n'), {
        status: args.status,
        from: args.from,
        to: args.to,
        totals,
        clients: ranked,
        doses: args.detail ? detail : undefined,
      });
    },
  );
}
