import { readFile } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPost } from '../api.js';
import { Format, ResponseFormat, fitToLimit, result } from '../shared.js';

/**
 * The policy library.
 *
 * This is the first write surface on the server, and it is shaped by one
 * rule: an agent may create a record in a state that does nothing until a
 * person acts on it, and may not move a record into the state that has an
 * effect on anyone.
 *
 * So a policy is always created as a DRAFT, and there is no publish tool.
 * Publishing is what asks every carer in the company to read and sign a
 * document; a person does that, in the portal, having looked at what was
 * created. Bulk-loading forty policies from a folder is a filing job and a
 * good use of an agent. Asking forty carers to sign documents nobody checked
 * is not.
 */

const CATEGORIES = [
  'SAFEGUARDING',
  'MEDICATION',
  'HEALTH_SAFETY',
  'IPC',
  'HR',
  'DATA',
  'CARE',
  'COMPLAINTS',
  'BUSINESS_CONTINUITY',
  'OTHER',
] as const;

const AUDIENCES = ['ALL', 'CARERS', 'OFFICE', 'MANAGERS'] as const;

interface PolicyRow {
  id: string;
  title: string;
  reference: string | null;
  category: string;
  version: string;
  issuedAt: string;
  reviewDate: string | null;
  audience: string;
  requiresAck: boolean;
  status: string;
  dueCount: number;
  signedCount: number;
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—');

export function registerPolicyTools(server: McpServer) {
  server.registerTool(
    'caremid_list_policies',
    {
      title: 'List policies',
      description:
        'Every policy in the library, with its version, review date, audience and how many of the staff it applies to have signed the current version. ' +
        'Use this before creating policies to see what is already there — the library has no duplicate check, so creating the same policy twice is easy and ugly to undo. ' +
        'Example: { status: "ACTIVE" } for the published ones.',
      inputSchema: z.strictObject({
        status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional().describe('Filter by state'),
        category: z.enum(CATEGORIES).optional().describe('Filter by category'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ status, category, response_format }, ctx) => {
      const rows = await apiGet<PolicyRow[]>('policies', { status, category }, ctx.mcpReq.signal);
      if (rows.length === 0) {
        return result(response_format as Format, 'The policy library is empty.', { policies: [] });
      }

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `**${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}**`,
          '',
          '| Title | Ref | Category | Version | Review | Audience | Signed | State |',
          '| --- | --- | --- | --- | --- | --- | --- | --- |',
          ...rs.map(
            (p) =>
              `| ${p.title} | ${p.reference ?? '—'} | ${p.category} | ${p.version} | ${day(p.reviewDate)} | ${p.audience} | ${p.requiresAck ? `${p.signedCount}/${p.dueCount}` : 'n/a'} | ${p.status} |`,
          ),
        ].join('\n'),
      );

      const note = omitted ? `\n\n_${omitted} more not shown._` : '';
      return result(response_format as Format, text + note, { policies: kept, omitted });
    },
  );

  server.registerTool(
    'caremid_create_policy',
    {
      title: 'Add a policy (as a draft)',
      description:
        'Creates ONE policy in the library, always as a DRAFT. Use it to load policies the company already has — from a folder of documents, for example. ' +
        'It cannot publish: a person does that in the portal, because publishing is what asks every carer the policy applies to to read and sign it. ' +
        'Call caremid_list_policies first; creating the same policy twice is easy and there is no duplicate check. ' +
        'Only fill review_date and version from what the document actually says. A guessed review date is worse than none, because the CQC dashboard will then report the policy as in date. ' +
        'Example: { title: "Medication Policy", category: "MEDICATION", version: "3.0", audience: "CARERS", body_text: "..." }',
      inputSchema: z.strictObject({
        title: z.string().min(1).max(300).describe('The policy name, as the document calls it'),
        category: z.enum(CATEGORIES).describe('Used to group the library'),
        body_text: z
          .string()
          .min(1)
          .max(300_000)
          .optional()
          .describe('The policy text, inline. This is what a carer reads on their phone, so include the whole thing, not a summary. Use body_file instead for anything long.'),
        body_file: z
          .string()
          .optional()
          .describe(
            'Absolute path to a UTF-8 .txt or .md file holding the policy text, read by the server. ' +
            'Prefer this for a bulk import: it keeps a 2MB library out of the conversation entirely. ' +
            'Exactly one of body_text or body_file.',
          ),
        reference: z.string().max(60).optional().describe("The company's own reference, e.g. POL-012"),
        version: z.string().max(20).optional().describe('From the document. Defaults to 1.0 if the document gives none.'),
        issued_at: z.string().optional().describe('ISO date the version was issued, if the document says'),
        review_date: z
          .string()
          .optional()
          .describe('ISO date it is next due for review. Leave unset unless the document states one.'),
        audience: z
          .enum(AUDIENCES)
          .optional()
          .describe('Who must read it. Defaults to ALL. Use CARERS for things only field staff do, like lone working.'),
        requires_ack: z
          .boolean()
          .optional()
          .describe('Whether staff must sign it. Defaults to true.'),
        response_format: ResponseFormat,
      }),
      // The only tool on this server that writes. Not destructive - it adds a
      // draft and changes nothing that exists - but not idempotent either:
      // calling it twice makes two policies.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      // Exactly one source. Both would be ambiguous; neither leaves a policy
      // staff are asked to sign with nothing in it.
      if (!args.body_text === !args.body_file) {
        throw new Error('Give exactly one of body_text or body_file.');
      }

      let body = args.body_text ?? '';
      if (args.body_file) {
        // The server runs locally as the operator, so this reads their own
        // disk. Kept to plain text on an absolute path: it is a policy
        // import, and the extension check turns a wrong path into an error
        // rather than a policy full of binary.
        if (!isAbsolute(args.body_file)) {
          throw new Error('body_file must be an absolute path.');
        }
        const ext = extname(args.body_file).toLowerCase();
        if (ext !== '.txt' && ext !== '.md') {
          throw new Error(`body_file must be .txt or .md, got "${ext || 'no extension'}".`);
        }
        body = await readFile(args.body_file, 'utf8');
        if (!body.trim()) throw new Error(`${args.body_file} is empty.`);
        if (body.length > 300_000) {
          throw new Error(`${args.body_file} is ${body.length} characters, over the 300,000 limit.`);
        }
      }

      const created = await apiPost<PolicyRow>(
        'policies',
        {
          title: args.title,
          category: args.category,
          bodyText: body,
          reference: args.reference,
          version: args.version,
          issuedAt: args.issued_at,
          reviewDate: args.review_date,
          audience: args.audience,
          requiresAck: args.requires_ack,
          // Explicit rather than relying on the API default: this tool must
          // never create anything that is already in front of staff.
          status: 'DRAFT',
        },
        ctx.mcpReq.signal,
      );

      const md =
        `Created **${created.title}** (v${created.version}) as a draft.\n\n` +
        `Category ${created.category} · audience ${created.audience} · review ${day(created.reviewDate)}\n\n` +
        '_Not published. Nobody has been asked to sign it. Publish it in the portal once the details have been checked._';

      return result(args.response_format as Format, md, created);
    },
  );
}
