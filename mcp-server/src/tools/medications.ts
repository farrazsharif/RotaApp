import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPost } from '../api.js';
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

  server.registerTool(
    'caremid_backfill_mar',
    {
      title: 'Fill MAR blanks left by a change of recording method',
      description:
        'Marks as given the doses that have NO record at all, where the visit that owned them was actually ' +
        'clocked into. For an office that enforced electronic recording partway through, those blanks are a ' +
        'recording gap rather than a care gap - but only where there is attendance behind them, which is what ' +
        'this checks. A dose is left blank where the visit was cancelled, was a personal-care-only call, was ' +
        'never clocked into, or the client was in hospital, and the dry run reports each of those counts ' +
        'separately. Run it WITHOUT apply first: the month-by-month figures are the test of whether the gap ' +
        'really does stop when the method changed. Every row it writes is marked as an office entry from the ' +
        'attendance record, so nothing reads as a signature given at the time. Example: { from: "2026-01-01", ' +
        'to: "2026-06-30" }',
      inputSchema: z.strictObject({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First date to fill, yyyy-mm-dd'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last date to fill, yyyy-mm-dd'),
        reason: z
          .string()
          .max(300)
          .optional()
          .describe('Optional. Added to the note on every row, after the office-entry marker.'),
        client: z.string().min(2).max(120).optional().describe('Limit to one client, by Caremid id'),
        apply: z.boolean().default(false).describe('false reports what would be filled and changes nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Only ever adds a record where none exists. It cannot change or
        // remove one: an existing record, of any status, is left alone.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const res = await apiPost<{
        applied: boolean; from: string; to: string; dosesDue: number; wouldFill: number; created?: number;
        capped: boolean; byMonth: Record<string, number>; byClient: { name: string; count: number }[];
        leftBlank: Record<string, number>;
      }>(
        'medications/administrations/backfill',
        { from: args.from, to: args.to, serviceUserId: args.client, reason: args.reason, apply: args.apply },
        ctx.mcpReq.signal,
      );

      const months = Object.entries(res.byMonth).sort(([a], [b]) => a.localeCompare(b));
      const blankWords: Record<string, string> = {
        noVisit: 'no visit on the rota owned the dose',
        visitCancelled: 'the visit was cancelled',
        visitNoMeds: 'a personal-care-only call',
        notAttended: 'on the rota, but nobody clocked in',
        away: 'in hospital or away on respite',
        alreadyRecorded: 'already has a record',
      };

      const lines = [
        res.applied
          ? `**${res.created}** dose${res.created === 1 ? '' : 's'} marked given, ${res.from} to ${res.to}.`
          : `**${res.wouldFill}** of ${res.dosesDue} doses due between ${res.from} and ${res.to} would be marked given.`,
        '',
        '**Left blank**',
        ...Object.entries(res.leftBlank)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `- ${n} — ${blankWords[k] ?? k}`),
      ];

      if (months.length) {
        lines.push(
          '',
          `**By month** — the shape that shows whether this is a recording gap or a care gap`,
          '',
          '| Month | Doses |',
          '| --- | --- |',
          ...months.map(([m, n]) => `| ${m} | ${n} |`),
        );
      }
      if (res.byClient.length) {
        lines.push(
          '',
          '| Client | Doses |',
          '| --- | --- |',
          ...res.byClient.slice(0, 40).map((c) => `| ${c.name} | ${c.count} |`),
        );
      }
      if (res.capped) lines.push('', '_Capped at 5000 doses for this call. Narrow the range and run it again._');
      if (!res.applied) lines.push('', '_Nothing written. Call again with apply: true._');

      return result(args.response_format as Format, lines.join('\n'), res);
    },
  );

  server.registerTool(
    'caremid_mar_exceptions_with_notes',
    {
      title: 'Missed doses with the carer\'s own account of the visit',
      description:
        'Every dose recorded as missed in a date range, each one shown with the CALL LOG of the visit it ' +
        'belonged to - which is where a carer actually writes what happened. A dose almost never carries a note ' +
        'of its own, but the visit it sat on often says "no answer", "gone to her appointment", "already taken ' +
        'by family". That is the evidence for reclassifying it, and this is how to read it. Also says whether ' +
        'the client was in hospital or on respite at the time. Read-only. Pass the ids it returns to ' +
        'caremid_reclassify_doses. Example: { from: "2026-07-01", to: "2026-11-22" }',
      inputSchema: z.strictObject({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First date, yyyy-mm-dd'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last date, yyyy-mm-dd'),
        client: z.string().min(2).max(120).optional().describe('Limit to one client, by Caremid id'),
        with_notes_only: z
          .boolean()
          .default(false)
          .describe('Only the doses whose visit has a call log — the ones there is something to read'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, ctx) => {
      const rows = await apiGet<{
        id: string; scheduledFor: string; status: string; note: string | null; medication: string | null;
        serviceUserId: string; serviceUser: string | null; recordedBy: string | null;
        awayAtTheTime: string | null; visitName: string | null; visitStatus: string | null; callLog: string | null;
      }[]>(
        'medications/mar-exceptions',
        { from: args.from, to: args.to, status: 'MISSED', serviceUserId: args.client },
        ctx.mcpReq.signal,
      );

      const kept = args.with_notes_only ? rows.filter((r) => r.callLog) : rows;
      const withLog = rows.filter((r) => r.callLog).length;

      const lines = [
        `**${rows.length}** missed dose${rows.length === 1 ? '' : 's'} between ${args.from} and ${args.to}. ` +
          `**${withLog}** sit on a visit whose call log says something.`,
        '',
        '| Id | Due | Client | Medication | Away? | Call log |',
        '| --- | --- | --- | --- | --- | --- |',
        ...kept.slice(0, 200).map(
          (r) =>
            `| \`${r.id}\` | ${fmtDate(r.scheduledFor)} ${r.scheduledFor.slice(11, 16)} | ${r.serviceUser ?? '—'} | ` +
            `${(r.medication ?? '—').slice(0, 44)} | ${r.awayAtTheTime ?? '—'} | ` +
            `${(r.callLog ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 140) || '—'} |`,
        ),
      ];
      if (kept.length > 200) lines.push('', `_Showing 200 of ${kept.length}. Narrow the range for the rest._`);

      return result(args.response_format as Format, lines.join('\n'), { total: rows.length, withCallLog: withLog, doses: kept });
    },
  );

  server.registerTool(
    'caremid_reclassify_doses',
    {
      title: 'Change a missed dose to in hospital or not at home',
      description:
        'Changes doses recorded as MISSED to NOT_AT_HOME or HOSPITAL, by id. Only from missed, and only to ' +
        'those two: it cannot turn a missed dose into a given one, which is a different claim and not this ' +
        'tool\'s to make. Use caremid_mar_exceptions_with_notes first and read the call log - "she went to her ' +
        'appointment" is a reason to change one, an empty log is not. Every change is audited with the status ' +
        'it replaced, and the dose keeps a note saying it was changed, so the original reading is recoverable. ' +
        'Runs as a dry run unless apply is true. Example: { ids: ["cmabc123"], to: "NOT_AT_HOME", note: "Call ' +
        'log: she went to the appointment, not back", apply: true }',
      inputSchema: z.strictObject({
        ids: z.array(z.string().min(6).max(60)).min(1).max(500).describe('Dose record ids from the exceptions tool'),
        to: z.enum(['NOT_AT_HOME', 'HOSPITAL']).describe('What the record should say instead'),
        note: z
          .string()
          .max(300)
          .optional()
          .describe('Added to each dose. Quote the call log where that is what settled it.'),
        apply: z.boolean().default(false).describe('false says what would change and changes nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Changes a record that is already there, which is exactly what the
        // destructive hint is for - even though the old status is kept in the
        // audit log and named in the dose's own note.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      if (!args.apply) {
        return result(
          args.response_format as Format,
          `**${args.ids.length}** dose${args.ids.length === 1 ? '' : 's'} would change from Missed to ` +
            `**${args.to === 'HOSPITAL' ? 'In hospital' : 'Not at home'}**` +
            `${args.note ? `, noted "${args.note}"` : ''}.\n\n_Nothing changed. Call again with apply: true._`,
          { applied: false, would_change: args.ids.length, to: args.to },
        );
      }

      const res = await apiPost<{ changed: number; to: string; notMissed: { id: string; status: string }[] }>(
        'medications/administrations/reclassify',
        { ids: args.ids, to: args.to, note: args.note },
        ctx.mcpReq.signal,
      );

      const lines = [
        `**${res.changed}** dose${res.changed === 1 ? '' : 's'} changed from Missed to ` +
          `**${args.to === 'HOSPITAL' ? 'In hospital' : 'Not at home'}**.`,
      ];
      if (res.notMissed.length) {
        lines.push(
          '',
          `**Left alone (${res.notMissed.length})** — not recorded as missed:`,
          ...res.notMissed.map((n) => `- \`${n.id}\` is ${n.status}`),
        );
      }
      return result(args.response_format as Format, lines.join('\n'), { applied: true, ...res });
    },
  );

  server.registerTool(
    'caremid_medication_schedule',
    {
      title: 'Scheduled medications, and which are really as-required',
      description:
        'Lists every active medication that carries dose times, flagging the ones whose wording says they are ' +
        'WHEN REQUIRED - "when required", "as required", "prn". A when-required medicine set up with dose times ' +
        'is scored every day it was not needed: the carer has to put something in the box, picks Missed, and a ' +
        'GTN spray for chest pain becomes a Regulation 12 finding. Caremid treats a medication with NO dose ' +
        'times as as-required, so clearing the times is the fix. Pass clear_ids with apply to do that - by id ' +
        'only, never by the wording, because clearing the times on something a person genuinely needs daily ' +
        'stops the carer being prompted for it. Doses already recorded are untouched. Example: { } to list, ' +
        'then { clear_ids: ["cmabc123"], apply: true }',
      inputSchema: z.strictObject({
        clear_ids: z
          .array(z.string().min(6).max(60))
          .max(200)
          .optional()
          .describe('Medication ids whose dose times should be cleared, making them as-required'),
        as_required_only: z.boolean().default(false).describe('List only the ones whose wording flags them'),
        apply: z.boolean().default(false).describe('false says what would change and changes nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Changes a medication that is already set up, which is what the
        // destructive hint is for. Nothing recorded is deleted - the doses
        // already given stay on the chart - but the regimen itself changes.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;

      if (args.clear_ids?.length && args.apply) {
        const res = await apiPost<{ changed: number; medications: { name: string; client: string; wasTimes: string }[] }>(
          'medications/clear-times',
          { ids: args.clear_ids },
          signal,
        );
        return result(
          args.response_format as Format,
          [
            `**${res.changed}** medication${res.changed === 1 ? '' : 's'} are now as-required.`,
            '',
            '| Client | Medication | Times cleared |',
            '| --- | --- | --- |',
            ...res.medications.map((m) => `| ${m.client} | ${m.name} | ${m.wasTimes} |`),
            '',
            '_Doses already recorded are unchanged. No new slot falls due._',
          ].join('\n'),
          { applied: true, ...res },
        );
      }

      const rows = await apiGet<{
        id: string; name: string; dose: string | null; instructions: string | null; times: string[];
        asRequired: boolean; serviceUser: string | null;
      }[]>('medications/schedule-review', {}, signal);

      if (args.clear_ids?.length) {
        const picked = rows.filter((r) => args.clear_ids!.includes(r.id));
        return result(
          args.response_format as Format,
          [
            `**${picked.length}** medication${picked.length === 1 ? '' : 's'} would become as-required.`,
            '',
            '| Client | Medication | Times now |',
            '| --- | --- | --- |',
            ...picked.map((m) => `| ${m.serviceUser ?? '—'} | ${m.name} | ${m.times.join(', ')} |`),
            '',
            '_Nothing changed. Call again with apply: true._',
          ].join('\n'),
          { applied: false, would_clear: picked },
        );
      }

      const kept = args.as_required_only ? rows.filter((r) => r.asRequired) : rows;
      const flagged = rows.filter((r) => r.asRequired).length;
      return result(
        args.response_format as Format,
        [
          `**${rows.length}** active medication${rows.length === 1 ? '' : 's'} carry dose times. ` +
            `**${flagged}** are worded as when-required.`,
          '',
          '| Id | Client | Medication | Times | When required? |',
          '| --- | --- | --- | --- | --- |',
          ...kept.slice(0, 150).map(
            (m) =>
              `| \`${m.id}\` | ${m.serviceUser ?? '—'} | ${`${m.name}${m.dose ? ` ${m.dose}` : ''}`.slice(0, 70)} | ` +
              `${m.times.join(', ')} | ${m.asRequired ? '**yes**' : '—'} |`,
          ),
        ].join('\n'),
        { total: rows.length, flagged, medications: kept },
      );
    },
  );
}
