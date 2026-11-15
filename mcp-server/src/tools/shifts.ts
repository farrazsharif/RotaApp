import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet } from '../api.js';
import { Format, ResponseFormat, fitToLimit, fmtDate, isoDate, result } from '../shared.js';

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  published?: boolean;
  visitName?: string | null;
  cover?: number | null;
  userId?: string | null;
  siteId?: string | null;
  site?: { name: string } | null;
  serviceUser?: { firstName: string; lastName: string } | null;
  coverCarers?: { id: string }[];
  residentSlots?: { userId: string | null }[];
}

/**
 * How many carers are named on a visit, and how many it needs.
 *
 * A Supported Living house visit carries its carers in resident slots — one
 * slot per required carer per resident — and leaves userId and coverCarers
 * empty. Counting only userId would report every house visit as unstaffed.
 */
function staffing(s: Shift): { assigned: number; needed: number } {
  if (s.siteId) {
    const slots = s.residentSlots ?? [];
    return { assigned: slots.filter((sl) => sl.userId).length, needed: slots.length };
  }
  return { assigned: (s.userId ? 1 : 0) + (s.coverCarers?.length ?? 0), needed: s.cover || 1 };
}

const subject = (s: Shift) =>
  s.siteId ? s.site?.name || 'House visit' : s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Unknown client';

export function registerShiftTools(server: McpServer) {
  server.registerTool(
    'caremid_unstaffed_visits',
    {
      title: 'Unstaffed visits',
      description:
        'Visits in a date range that do not have all the carers they need — either nobody at all, or fewer than ' +
        'the number the visit calls for (a double-up with one carer). Supported Living house visits are counted ' +
        'by their resident slots rather than a single carer, so they are reported correctly rather than always ' +
        'appearing empty. ' +
        'Use this for "what is still unassigned next week" or "which visits are short". ' +
        'Cancelled visits are excluded. ' +
        'Example: { from: "2026-11-17", to: "2026-11-23", only_empty: false }.',
      inputSchema: z.strictObject({
        from: isoDate.describe('First date to include, YYYY-MM-DD.'),
        to: isoDate.describe('Last date to include, YYYY-MM-DD.'),
        only_empty: z
          .boolean()
          .default(false)
          .describe('True returns only visits with no carer at all; false also returns short-staffed ones.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ from, to, only_empty, response_format }, ctx) => {
      if (new Date(from) > new Date(to)) {
        throw new Error(`'from' (${from}) is after 'to' (${to}). Swap them and call again.`);
      }

      const shifts = await apiGet<Shift[]>('shifts', { startDate: from, endDate: to }, ctx.mcpReq.signal);

      const rows = shifts
        .filter((s) => s.status !== 'CANCELLED')
        .map((s) => ({ s, ...staffing(s) }))
        .filter(({ assigned, needed }) => (only_empty ? assigned === 0 : assigned < needed))
        .map(({ s, assigned, needed }) => ({
          id: s.id,
          date: s.date.slice(0, 10),
          time: `${s.startTime}–${s.endTime}`,
          subject: subject(s),
          visit_name: s.visitName ?? null,
          assigned,
          needed,
          published: s.published ?? null,
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

      const empty = rows.filter((r) => r.assigned === 0).length;

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `# Unstaffed visits, ${fmtDate(from)} to ${fmtDate(to)}`,
          `${rows.length} visit${rows.length === 1 ? '' : 's'} short — ${empty} with no carer at all${
            rows.length > rs.length ? `. Showing ${rs.length}; ${rows.length - rs.length} omitted to stay within the response limit` : ''
          }.`,
          '',
          ...rs.map(
            (r) =>
              `- ${r.assigned === 0 ? '🔴' : '🟠'} **${r.date}** ${r.time} — ${r.subject}${
                r.visit_name ? ` (${r.visit_name})` : ''
              } — ${r.assigned} of ${r.needed} carer${r.needed === 1 ? '' : 's'}${r.published === false ? ' · draft' : ''}`,
          ),
        ].join('\n'),
      );

      return result(response_format as Format, text, {
        from,
        to,
        total: rows.length,
        count: kept.length,
        omitted,
        empty_count: empty,
        visits: kept,
      });
    },
  );
}
