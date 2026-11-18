import { readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPost, apiPostFile } from '../api.js';
import { Format, ResponseFormat, fitToLimit, result } from '../shared.js';

/**
 * The policy register.
 *
 * A list of the policies the service runs on: title, category, when it was
 * last reviewed, and the document. There are no draft/published states and no
 * read-and-sign - the register is an office record, and nothing here is
 * pushed at carers.
 *
 * Two write tools, and both are additive: one adds a policy, one attaches its
 * PDF. Neither can delete anything.
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

interface PolicyRow {
  id: string;
  title: string;
  category: string;
  reviewedAt: string | null;
  files: { fileName: string; size: number }[];
}

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : 'never');

export function registerPolicyTools(server: McpServer) {
  server.registerTool(
    'caremid_list_policies',
    {
      title: 'List policies',
      description:
        'The policy register: every policy, its category, the date it was last reviewed, and whether the document is attached. ' +
        'Call this before adding anything - the register has no duplicate check, so adding the same policy twice is easy and ugly to undo. ' +
        'Example: { category: "MEDICATION" }.',
      inputSchema: z.strictObject({
        category: z.enum(CATEGORIES).optional().describe('Filter by category'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ category, response_format }, ctx) => {
      const rows = await apiGet<PolicyRow[]>('policies', { category }, ctx.mcpReq.signal);
      if (rows.length === 0) {
        return result(response_format as Format, 'The policy register is empty.', { policies: [] });
      }

      const { rows: kept, text, omitted } = fitToLimit(rows, (rs) =>
        [
          `**${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}**`,
          '',
          '| Title | Category | Last reviewed | Document |',
          '| --- | --- | --- | --- |',
          ...rs.map(
            (p) => `| ${p.title} | ${p.category} | ${day(p.reviewedAt)} | ${p.files.length ? p.files[0].fileName : '—'} |`,
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
      title: 'Add a policy to the register',
      description:
        'Adds ONE policy to the register. Use it to load the policies a company already has, from a folder of documents. ' +
        'Attach the document itself with caremid_attach_policy_pdf afterwards. ' +
        'Call caremid_list_policies first; adding the same policy twice is easy and there is no duplicate check. ' +
        'Only set reviewed_at from what the document or the office actually says - a guessed date would have the CQC dashboard report the policy as reviewed when nobody has looked at it. ' +
        'Example: { title: "Medication", category: "MEDICATION" }',
      inputSchema: z.strictObject({
        title: z.string().min(1).max(300).describe('The policy name, as the document calls it'),
        category: z.enum(CATEGORIES).describe('Used to group the register'),
        reviewed_at: z
          .string()
          .optional()
          .describe('ISO date it was last reviewed. Leave unset unless that date is actually known.'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const created = await apiPost<PolicyRow>(
        'policies',
        { title: args.title, category: args.category, reviewedAt: args.reviewed_at },
        ctx.mcpReq.signal,
      );
      return result(
        args.response_format as Format,
        `Added **${created.title}** (${created.category}, last reviewed ${day(created.reviewedAt)}).`,
        created,
      );
    },
  );

  server.registerTool(
    'caremid_attach_policy_pdf',
    {
      title: 'Attach the original document to a policy',
      description:
        'Attaches the PDF to a policy already on the register - the document itself, which is what prints and what an inspector is handed. ' +
        'Finds the policy by its exact title; if the title matches no policy, or more than one, it refuses rather than guessing. ' +
        'Re-attaching a file with the same name replaces it, so a policy never ends up with three slightly different PDFs and nobody able to tell which is in force. ' +
        'Example: { title: "Adult Safeguarding", file: "C:\\policies\\Adult Safeguarding.pdf" }',
      inputSchema: z.strictObject({
        title: z.string().min(1).max(300).describe('The policy title, exactly as caremid_list_policies shows it'),
        file: z.string().describe('Absolute path to the PDF on this machine'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Replaces a same-named file on the policy it names, and nothing else.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      if (!isAbsolute(args.file)) throw new Error('file must be an absolute path.');
      if (extname(args.file).toLowerCase() !== '.pdf') {
        throw new Error(`file must be a .pdf, got "${extname(args.file) || 'no extension'}".`);
      }

      // Matched on the title the library actually holds. Guessing which of two
      // similarly named policies was meant is how the wrong document ends up
      // attached to the one people read.
      const all = await apiGet<PolicyRow[]>('policies', {}, ctx.mcpReq.signal);
      const hits = all.filter((p) => p.title === args.title);
      if (hits.length === 0) {
        throw new Error(`No policy titled "${args.title}". Call caremid_list_policies to see the exact titles.`);
      }
      if (hits.length > 1) {
        throw new Error(`${hits.length} policies are titled "${args.title}". Rename one before attaching.`);
      }

      const bytes = await readFile(args.file);
      const uploaded = await apiPostFile<{ fileName: string; size: number }>(
        `policies/${hits[0].id}/attachment`,
        { bytes, fileName: basename(args.file), contentType: 'application/pdf' },
        ctx.mcpReq.signal,
      );

      const kb = Math.round(uploaded.size / 1024);
      return result(
        args.response_format as Format,
        `Attached **${uploaded.fileName}** (${kb} KB) to **${args.title}**.`,
        { policy: args.title, ...uploaded },
      );
    },
  );
}
