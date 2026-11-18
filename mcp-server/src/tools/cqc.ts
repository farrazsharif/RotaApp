import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet } from '../api.js';
import { Format, ResponseFormat, result } from '../shared.js';

interface CheckItem {
  id: string;
  label: string;
  link?: string;
}
interface Check {
  id: string;
  title: string;
  statement: string;
  status: 'red' | 'amber' | 'green' | 'info';
  count: number;
  total: number;
  detail: string;
  items: CheckItem[];
}
interface KeyQuestionBlock {
  key: string;
  label: string;
  score: number;
  checks: Check[];
}
interface Readiness {
  generatedAt: string;
  overallScore: number;
  keyQuestions: KeyQuestionBlock[];
}

const ICON: Record<Check['status'], string> = { red: '🔴', amber: '🟠', green: '🟢', info: 'ℹ️' };

export function registerCqcTools(server: McpServer) {
  server.registerTool(
    'caremid_cqc_readiness',
    {
      title: 'CQC readiness',
      description:
        'The whole CQC evidence sweep for the company, grouped by key question (Safe, Effective, Caring, Responsive, Well-led). ' +
        'Each check names the regulation or quality statement behind it, how many records fail, and which ones. ' +
        'Covers care plans and review dates, risk assessments, likes and dislikes, client reviews, staff supervisions, ' +
        'spot checks, expired training, missed medication in the last 30 days, and unassigned visits in the next 7 days. ' +
        "Use this for \"how are we doing\", \"what's failing\", or \"what would an inspector pick up\". " +
        'For who is missing which document from their staff file, call caremid_staff_compliance instead. ' +
        "Example: { only_failing: true } for just the red and amber checks.",
      inputSchema: z.strictObject({
        only_failing: z
          .boolean()
          .default(true)
          .describe('Return only checks that are red or amber. Set false to include everything that passed.'),
        include_items: z
          .boolean()
          .default(true)
          .describe('Include the named records behind each failing check (capped at 50 per check by the API).'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ only_failing, include_items, response_format }, ctx) => {
      const data = await apiGet<Readiness>('cqc/readiness', {}, ctx.mcpReq.signal);

      const blocks = data.keyQuestions.map((kq) => ({
        ...kq,
        checks: kq.checks
          .filter((c) => (only_failing ? c.status === 'red' || c.status === 'amber' : true))
          .map((c) => ({ ...c, items: include_items ? c.items : [] })),
      }));

      const failing = data.keyQuestions.flatMap((kq) => kq.checks).filter((c) => c.status === 'red' || c.status === 'amber');

      const payload = {
        generated_at: data.generatedAt,
        overall_score: data.overallScore,
        failing_count: failing.length,
        key_questions: blocks,
      };

      const md = [
        `# CQC readiness — ${data.overallScore}%`,
        `${failing.length} check${failing.length === 1 ? '' : 's'} not green.`,
        '',
        ...blocks.flatMap((kq) => {
          if (kq.checks.length === 0) return [];
          return [
            `## ${kq.label} — ${kq.score}%`,
            ...kq.checks.map((c) => {
              // Some checks count things rather than measuring a population
              // (unassigned visits has no denominator), and "47/0" reads as a
              // bug rather than as a count. Print the ratio only when there
              // is one.
              const tally = c.total > 0 ? `(${c.count}/${c.total}) ` : c.count > 0 ? `(${c.count}) ` : '';
              const head = `- ${ICON[c.status]} **${c.title}** ${tally}— ${c.detail}`;
              const sub = `  _${c.statement}_`;
              const names =
                include_items && c.items.length
                  ? `  Affected: ${c.items.map((i) => i.label).join(', ')}`
                  : '';
              return [head, sub, names].filter(Boolean).join('\n');
            }),
            '',
          ];
        }),
      ].join('\n');

      return result(response_format as Format, md, payload);
    },
  );
}
