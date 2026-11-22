import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPatch, apiPost } from '../api.js';
import { Format, ResponseFormat, fmtDate, result } from '../shared.js';

/**
 * Two fields on a client record: allergies, and resuscitation status.
 *
 * They are here and nothing else is, because these are the two a carer needs
 * before they walk in and the two Caremid counts as red when blank. Editing a
 * client, a care plan or a risk assessment is not on this server at all.
 *
 * The rule that matters: it FILLS BLANKS. A value already on record is never
 * replaced - the server returns the conflict and a person looks at it.
 * Overwriting "penicillin" with something read off an older document is the
 * one outcome worth designing the whole tool around.
 *
 * Nothing here infers. A support plan that says "List is empty" means none
 * recorded; a tick box in a scan, or OCR of somebody's handwriting, means
 * NOTHING and must not be turned into a value. Blank is the honest answer
 * where nobody has asked, and Caremid's own schema says so: null means nobody
 * has asked, which is not the same as none.
 */

// What Caremid stores. NONE means asked and there is no DNACPR or ReSPECT.
const DNACPR = ['NONE', 'DNACPR', 'RESPECT'] as const;

// The risk assessment forms Caremid holds, as the apps name them.
const RA_TYPES = [
  'ENVIRONMENT', 'FIRE_SAFETY', 'FALLS', 'MOVING_HANDLING', 'MEDICATION', 'PRESSURE_ULCER',
  'MALNUTRITION', 'CHOKING', 'SELF_NEGLECT', 'BEHAVIOUR', 'LONE_WORKING', 'SMOKING', 'BATHING',
] as const;

// Answers are filed under the form schema's own key for each question.
const ITEM_KEY = /^[a-z][a-z0-9_]*__\d{1,3}$/;

interface ClientDoc {
  id: string;
  category: string | null;
  fileName: string;
  size: number;
  contentType: string;
  expiresAt: string | null;
  createdAt: string;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  status: string;
  allergies: string | null;
  dnacprStatus: string | null;
  dnacprLocation: string | null;
}

/**
 * Off the caseload. `active` is a separate flag from `status`, and the two
 * drift: thirteen people were still flagged active with a status of
 * DISCHARGED or DECEASED. Filtering on `active` alone put them in the list,
 * which overstated the caseload and - the part that matters - would have let
 * a resuscitation status be written onto the record of somebody who has died.
 *
 * Matches the rule the CQC sweep already used in computeReadiness().
 */
const OFF_CASELOAD = new Set(['DISCHARGED', 'DECEASED']);

const fullName = (c: Client) => `${c.firstName} ${c.lastName}`.replace(/\s+/g, ' ').trim();

async function activeClients(signal: AbortSignal): Promise<Client[]> {
  return (await apiGet<Client[]>('service-users', { active: 'true' }, signal)).filter(
    (c) => c.active && !OFF_CASELOAD.has(c.status),
  );
}

/** Exact, case-insensitive on the full name. Two matches are reported. */
function matchClient(who: string, clients: Client[]): Client {
  const byId = clients.find((c) => c.id === who);
  if (byId) return byId;

  const want = who.trim().toLowerCase().replace(/\s+/g, ' ');
  const hits = clients.filter((c) => fullName(c).toLowerCase() === want);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    throw new Error(`${hits.length} active clients are called "${who}". Use the Caremid id instead.`);
  }
  const near = clients
    .filter((c) => fullName(c).toLowerCase().includes(want.split(' ')[0] ?? ''))
    .slice(0, 5)
    .map(fullName);
  throw new Error(
    `No client called "${who}" on the active caseload (discharged and deceased are not listed).` +
      (near.length ? ` Did you mean: ${near.join(', ')}?` : ''),
  );
}

export function registerClientTools(server: McpServer) {
  server.registerTool(
    'caremid_client_file',
    {
      title: "What is on a client's record",
      description:
        'Everything filed against one client: their documents with the category each is under, and what is ' +
        'currently recorded for allergies and resuscitation status. Use it to find a support plan before reading ' +
        'it, or to see what a client record already holds. Leave out client to SWEEP every active client at once, ' +
        'which is how to answer "who has a discharge letter" without asking fifty times; add matching to list only ' +
        'the documents whose name contains it, several separated by |. Examples: { client: "Najib Rahman" } for ' +
        'one person, or { matching: "discharge|D2A|support plan" } across everybody.',
      inputSchema: z.strictObject({
        client: z
          .string()
          .min(2)
          .max(120)
          .optional()
          .describe('Full name or Caremid id. Leave it out to sweep every active client.'),
        matching: z
          .string()
          .min(2)
          .max(120)
          .optional()
          .describe('Only list documents whose name contains this (case-insensitive). Several, separated by |.'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      const all = await activeClients(signal);
      const want = args.matching
        ? args.matching.split('|').map((w) => w.trim().toLowerCase()).filter(Boolean)
        : null;
      const keep = (d: ClientDoc) => !want || want.some((w) => d.fileName.toLowerCase().includes(w));

      // Sweep: every active client at once, which is the only way to answer
      // "who has a discharge letter" without asking fifty times.
      if (!args.client) {
        const rows: { client: Client; docs: ClientDoc[] }[] = [];
        // A few at a time: fifty sequential round trips is a slow tool call,
        // and fifty at once is a thundering herd at the API.
        for (let i = 0; i < all.length; i += 6) {
          const batch = await Promise.all(
            all.slice(i, i + 6).map(async (c) => ({
              client: c,
              docs: (
                await apiGet<ClientDoc[]>('documents', { ownerType: 'SERVICE_USER', ownerId: c.id }, signal)
              ).filter(keep),
            })),
          );
          rows.push(...batch);
        }

        const withDocs = rows.filter((r) => r.docs.length);
        const lines = [
          `**${withDocs.length}** of ${rows.length} active clients have a document` +
            `${args.matching ? ` matching "${args.matching}"` : ''}.`,
          '',
          '| Client | Resuscitation | Allergies | Documents |',
          '| --- | --- | --- | --- |',
          ...withDocs.map(
            (r) =>
              `| ${fullName(r.client)} | ${r.client.dnacprStatus || '—'} | ${r.client.allergies ? 'yes' : '—'} | ` +
              r.docs.map((d) => `${d.fileName} \`${d.id}\``).join('<br>') +
              ' |',
          ),
        ];
        const none = rows.filter((r) => !r.docs.length).map((r) => fullName(r.client));
        if (none.length) lines.push('', `**Nothing matching (${none.length}):** ${none.join(', ')}`);

        return result(args.response_format as Format, lines.join('\n'), {
          matched: withDocs.map((r) => ({
            client: fullName(r.client),
            client_id: r.client.id,
            dnacpr_status: r.client.dnacprStatus,
            allergies: r.client.allergies,
            documents: r.docs.map((d) => ({ id: d.id, file_name: d.fileName, category: d.category })),
          })),
          without: none,
        });
      }

      const client = matchClient(args.client, all);
      const docs = (
        await apiGet<ClientDoc[]>('documents', { ownerType: 'SERVICE_USER', ownerId: client.id }, signal)
      ).filter(keep);

      const lines = [
        `# ${fullName(client)}`,
        '',
        `**Status:** ${client.status}`,
        `**Allergies:** ${client.allergies || '_not recorded_'}`,
        `**Resuscitation:** ${client.dnacprStatus || '_not recorded_'}` +
          (client.dnacprLocation ? ` — ${client.dnacprLocation}` : ''),
        '',
        `**Documents (${docs.length})**`,
      ];
      if (docs.length) {
        lines.push(
          '',
          '| Category | File | Added | Id |',
          '| --- | --- | --- | --- |',
          ...docs.map(
            (d) => `| ${d.category || '—'} | ${d.fileName} | ${fmtDate(d.createdAt)} | ${d.id} |`,
          ),
        );
      } else {
        lines.push('', '_Nothing filed._');
      }

      return result(args.response_format as Format, lines.join('\n'), {
        client: fullName(client),
        client_id: client.id,
        allergies: client.allergies,
        dnacpr_status: client.dnacprStatus,
        dnacpr_location: client.dnacprLocation,
        documents: docs,
      });
    },
  );

  server.registerTool(
    'caremid_fetch_document',
    {
      title: 'Download a filed document so it can be read',
      description:
        'Downloads one document already filed in Caremid - a client support plan, a staff certificate - and ' +
        'saves it to a folder on this machine so its contents can be read. Changes nothing in Caremid. Give the ' +
        'document id from caremid_client_file or caremid_staff_file. Example: { document_id: "cmabc123", into: ' +
        '"C:/temp/plans" }',
      inputSchema: z.strictObject({
        document_id: z.string().min(6).max(60).describe('From caremid_client_file or caremid_staff_file'),
        into: z.string().min(3).max(400).describe('Absolute path to an existing or creatable folder'),
        response_format: ResponseFormat,
      }),
      annotations: {
        // Reads from Caremid. It writes a file on this machine, which is the
        // point, but nothing in the record changes.
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      if (!isAbsolute(args.into)) throw new Error('into must be an absolute folder path.');

      const { url } = await apiGet<{ url: string }>(`documents/${args.document_id}/download`, {}, signal);
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`The storage link returned ${res.status}.`);
      const bytes = new Uint8Array(await res.arrayBuffer());

      // The signed URL carries the original name; fall back to the id.
      let name = args.document_id;
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get('content-disposition') || '');
      if (m) name = decodeURIComponent(m[1]);
      else {
        const last = new URL(url).pathname.split('/').pop();
        if (last) name = decodeURIComponent(last);
      }
      name = name.replace(/[\\/:*?"<>|]/g, '_');

      await mkdir(args.into, { recursive: true });
      const path = join(args.into, name);
      await writeFile(path, bytes);

      const kb = Math.round(bytes.byteLength / 1024);
      return result(
        args.response_format as Format,
        `Saved **${name}** (${kb} KB) to \`${path}\`. Nothing in Caremid changed.`,
        { saved_to: path, file_name: name, bytes: bytes.byteLength },
      );
    },
  );

  server.registerTool(
    'caremid_record_client_safety_info',
    {
      title: 'Record a client\'s allergies or resuscitation status',
      description:
        'Fills in the allergies and resuscitation status on a client record, from a named source document. It ' +
        'ONLY FILLS BLANKS: a value already recorded is never replaced, and an attempt to change one comes back as ' +
        'a refusal naming both values, because overwriting a recorded allergy with something read off an older ' +
        'document is the mistake that matters here. allergies is free text - use the words the document uses, or ' +
        '"None known" where it positively states there are none. Leave it out entirely where the document is ' +
        'silent: blank means nobody has asked, which is not the same as none, and filling it with "Not known" ' +
        'turns the CQC check green while establishing nothing. resuscitation is NONE, DNACPR or RESPECT and must ' +
        'come from a document that says so in words - never from a tick box in a scan or OCR of handwriting. ' +
        'Runs as a dry run unless apply is true. Example: { entries: [{ client: "Harry Davies", allergies: ' +
        '"Penicillin", source: "424020 Support Plan.pdf" }], apply: true }',
      inputSchema: z.strictObject({
        entries: z
          .array(
            z.strictObject({
              client: z.string().min(2).max(120).describe('Full name or Caremid id'),
              allergies: z
                .string()
                .max(500)
                .optional()
                .describe('As the document words it, or "None known". Omit where the document is silent.'),
              resuscitation: z
                .enum(DNACPR)
                .optional()
                .describe('Only from a document that states it in words'),
              dnacpr_location: z
                .string()
                .max(200)
                .optional()
                .describe('Where the form physically is in the home, if the document says'),
              source: z
                .string()
                .min(3)
                .max(200)
                .describe('The document this came from, named so the entry can be checked'),
            }),
          )
          .min(1)
          .max(50)
          .describe('One entry per client'),
        apply: z.boolean().default(false).describe('false says what would be filled and changes nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Fills empty fields. Cannot replace a value that is already there -
        // the server refuses and says what is held.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      const clients = await activeClients(signal);

      type Plan = { client: Client; body: Record<string, string>; source: string; fields: string[] };
      const planned: Plan[] = [];
      const skipped: { who: string; why: string }[] = [];
      const failed: { who: string; why: string }[] = [];

      for (const e of args.entries) {
        let client: Client;
        try {
          client = matchClient(e.client, clients);
        } catch (err) {
          failed.push({ who: e.client, why: (err as Error).message });
          continue;
        }
        const who = fullName(client);

        const body: Record<string, string> = {};
        const fields: string[] = [];
        const clash: string[] = [];

        const consider = (
          key: 'allergies' | 'dnacprStatus' | 'dnacprLocation',
          value: string | undefined,
          held: string | null,
          label: string,
        ) => {
          if (!value || !value.trim()) return;
          const next = value.trim();
          const have = (held || '').trim();
          if (have && have.toLowerCase() !== next.toLowerCase()) {
            clash.push(`${label} already reads "${have}", not "${next}"`);
            return;
          }
          if (have) return;
          body[key] = next;
          fields.push(label);
        };

        consider('allergies', e.allergies, client.allergies, 'Allergies');
        consider('dnacprStatus', e.resuscitation, client.dnacprStatus, 'Resuscitation status');
        consider('dnacprLocation', e.dnacpr_location, client.dnacprLocation, 'DNACPR location');

        if (clash.length) {
          skipped.push({ who, why: `${clash.join('; ')} — left alone, check which is right` });
          continue;
        }
        if (!fields.length) {
          skipped.push({ who, why: 'already recorded, or nothing supplied' });
          continue;
        }
        planned.push({ client, body, source: e.source, fields });
      }

      const table = (rows: Plan[]) => [
        '| Client | Allergies | Resuscitation | From |',
        '| --- | --- | --- | --- |',
        ...rows.map(
          (p) =>
            `| ${fullName(p.client)} | ${p.body.allergies ?? '—'} | ` +
            `${p.body.dnacprStatus ?? '—'}${p.body.dnacprLocation ? ` (${p.body.dnacprLocation})` : ''} | ${p.source} |`,
        ),
      ];

      if (!args.apply) {
        const lines = [
          `**${planned.length}** client record${planned.length === 1 ? '' : 's'} would be filled in` +
            `${skipped.length ? `, ${skipped.length} left alone` : ''}${failed.length ? `, ${failed.length} refused` : ''}.`,
        ];
        if (planned.length) lines.push('', ...table(planned));
        if (skipped.length) lines.push('', '**Left alone**', ...skipped.map((s) => `- ${s.who} — ${s.why}`));
        if (failed.length) lines.push('', '**Refused**', ...failed.map((s) => `- ${s.who} — ${s.why}`));
        lines.push('', '_Nothing changed. Call again with apply: true._');
        return result(args.response_format as Format, lines.join('\n'), {
          applied: false,
          would_fill: planned.map((p) => ({ client: fullName(p.client), ...p.body, source: p.source })),
          skipped,
          failed,
        });
      }

      const done: Plan[] = [];
      for (const p of planned) {
        try {
          await apiPatch(`service-users/${p.client.id}/safety-info`, { ...p.body, source: p.source }, signal);
          done.push(p);
        } catch (err) {
          failed.push({ who: fullName(p.client), why: (err as Error).message });
        }
      }

      const lines = [
        `**${done.length}** client record${done.length === 1 ? '' : 's'} filled in` +
          `${skipped.length ? `, ${skipped.length} left alone` : ''}${failed.length ? `, ${failed.length} failed` : ''}.`,
      ];
      if (done.length) lines.push('', ...table(done));
      if (skipped.length) lines.push('', '**Left alone**', ...skipped.map((s) => `- ${s.who} — ${s.why}`));
      if (failed.length) lines.push('', '**Failed**', ...failed.map((s) => `- ${s.who} — ${s.why}`));

      return result(args.response_format as Format, lines.join('\n'), {
        applied: true,
        filled: done.map((p) => ({ client: fullName(p.client), ...p.body, source: p.source })),
        skipped,
        failed,
      });
    },
  );

  server.registerTool(
    'caremid_record_paper_risk_assessment',
    {
      title: 'Type up a risk assessment that exists on paper',
      description:
        'Copies a risk assessment from a signed paper form into Caremid, so the office works from the software ' +
        'rather than the filing cabinet. It ONLY CREATES: if the client already has an assessment of this type ' +
        'the call is refused, so an assessment a carer is working to is never overwritten. Answers are filed ' +
        'under the form schema\'s own item keys - item "sec3__9" is section 3 question 10, counting from zero - ' +
        'so read the form schema first and check the dry run names the right number of answers per section, ' +
        'because an answer filed one row out is a wrong answer against a safety question. completed_date is the ' +
        'date ON THE PAPER FORM, never today: a transcribed assessment dated today silences the review-overdue ' +
        'check on a document that may be years old. Runs as a dry run unless apply is true. Example: { client: ' +
        '"Nasim Sheikh", type: "ENVIRONMENT", assessor: "Yasmin Malik", completed_date: "2017-07-25", source: ' +
        '"Risk Assessment Environmental.pdf", answers: [{ item: "sec1__0", level: "LOW", comment: "No" }], ' +
        'apply: true }',
      inputSchema: z.strictObject({
        client: z.string().min(2).max(120).describe('Full name or Caremid id'),
        type: z.enum(RA_TYPES).describe('Which risk assessment form'),
        assessor: z.string().min(2).max(120).describe('Who signed the paper form'),
        completed_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('The date on the paper form, yyyy-mm-dd - not today'),
        review_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Next review, if the form states one'),
        source: z.string().min(3).max(200).describe('The paper form this came from, named so it can be checked'),
        answers: z
          .array(
            z.strictObject({
              item: z.string().regex(ITEM_KEY).describe('Form schema key, e.g. "sec3__9"'),
              level: z
                .enum(['LOW', 'MED', 'HIGH'])
                .optional()
                .describe('The risk level ticked. Omit where the form has no tick - do not invent one.'),
              comment: z.string().max(1000).optional().describe('The comment as written on the form'),
              action: z.string().max(1000).optional().describe('The action column, where one is written'),
              text: z
                .string()
                .max(2000)
                .optional()
                .describe('For a text or date question (details, sign-off) instead of level/comment'),
            }),
          )
          .min(1)
          .max(400)
          .describe('One per question answered on the paper form'),
        apply: z.boolean().default(false).describe('false shows what would be filed and changes nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Creates a record that is not there. Refuses outright where one is,
        // so it cannot overwrite or delete anything.
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      const client = matchClient(args.client, await activeClients(signal));
      const who = fullName(client);

      const seen = new Set<string>();
      for (const a of args.answers) {
        if (seen.has(a.item)) throw new Error(`${a.item} appears twice. Each question is answered once.`);
        seen.add(a.item);
        if (a.text !== undefined && (a.level !== undefined || a.comment !== undefined || a.action !== undefined)) {
          throw new Error(`${a.item} has both text and level/comment - a question is one or the other.`);
        }
      }

      // Per section, so a missing or duplicated row shows up as a count that
      // does not match the paper form rather than as a silent shift.
      const bySection = new Map<string, number>();
      for (const a of args.answers) {
        const sec = a.item.split('__')[0];
        bySection.set(sec, (bySection.get(sec) ?? 0) + 1);
      }

      const held = await apiGet<{ updatedAt?: string } | null>(
        `risk-assessments/${client.id}/${args.type}`,
        {},
        signal,
      );
      if (held) {
        throw new Error(
          `${who} already has a ${args.type} risk assessment in Caremid (last updated ` +
            `${(held.updatedAt || '').slice(0, 10)}). This tool only creates one that is not there yet.`,
        );
      }

      const header = [
        `**${who}** — ${args.type} risk assessment, from paper.`,
        '',
        `Completed **${args.completed_date}** by **${args.assessor}**` +
          `${args.review_date ? `, next review ${args.review_date}` : ''}. Source: ${args.source}.`,
        '',
        `**${args.answers.length}** answers across ${bySection.size} sections:`,
        '',
        '| Section | Answers | Highest level |',
        '| --- | --- | --- |',
        ...[...bySection.entries()].map(([sec, n]) => {
          const levels = args.answers.filter((a) => a.item.startsWith(`${sec}__`)).map((a) => a.level);
          const top = levels.includes('HIGH') ? 'HIGH' : levels.includes('MED') ? 'MED' : levels.includes('LOW') ? 'LOW' : '—';
          return `| ${sec} | ${n} | ${top} |`;
        }),
      ];

      if (!args.apply) {
        const blank = args.answers.filter((a) => a.text === undefined && !a.level).map((a) => a.item);
        const lines = [...header];
        if (blank.length) {
          lines.push('', `**No level ticked on the form (${blank.length}):** ${blank.join(', ')}`);
        }
        lines.push('', '_Nothing filed. Call again with apply: true._');
        return result(args.response_format as Format, lines.join('\n'), {
          applied: false,
          client: who,
          client_id: client.id,
          type: args.type,
          answers: args.answers.length,
          sections: Object.fromEntries(bySection),
          no_level: blank,
        });
      }

      const answers: Record<string, unknown> = {};
      for (const a of args.answers) {
        answers[a.item] =
          a.text !== undefined
            ? a.text
            : { level: a.level ?? '', comment: a.comment ?? '', action: a.action ?? '' };
      }

      const saved = await apiPost<{ id: string; answers: number }>(
        `risk-assessments/${client.id}/${args.type}/from-paper`,
        {
          assessor: args.assessor,
          completedDate: args.completed_date,
          reviewDate: args.review_date,
          source: args.source,
          answers,
        },
        signal,
      );

      return result(
        args.response_format as Format,
        [
          ...header,
          '',
          `Filed as \`${saved.id}\`. It is dated ${args.completed_date}, so Caremid will show it as due for ` +
            'review on that cycle - read it against the paper form before relying on it.',
        ].join('\n'),
        { applied: true, client: who, client_id: client.id, type: args.type, id: saved.id, answers: saved.answers },
      );
    },
  );
}
