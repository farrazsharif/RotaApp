import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPost, apiPostFile } from '../api.js';
import { Format, ResponseFormat, fitToLimit, fmtDate, isoDate, result } from '../shared.js';

/**
 * The staff file (Reg 19).
 *
 * Two write tools: one files a document against a requirement, one records a
 * training certificate. Both are additive. Neither can replace or delete
 * anything, and both skip what is already on file, so running an import twice
 * leaves the file exactly as the first run left it.
 *
 * What is deliberately not here: supervisions and spot checks. Caremid lets
 * only an ADMIN record a supervision that was held on paper, because
 * backdating one is how a supervision dashboard comes to show a conversation
 * that nobody had. The service account is not an admin and this does not work
 * around that - a supervision PDF can be filed as a document, which is
 * evidence of the meeting without being a claim that it was logged.
 */

// The categories the Documents tab offers for a staff member. This mirrors
// USER_DOC_CATEGORIES in backend/src/lib/staffCompliance.ts, and a category
// outside that list satisfies no requirement - it files the document
// somewhere nothing looks, which is worse than leaving it out.
const CATEGORIES = [
  'DBS Certificate',
  'Offer Letter',
  'Contract',
  'Reference',
  'Right to Work',
  'Training Certificate',
  'ID',
  'Driving Licence',
  'Fit for Work',
  'Proof of Address',
  'Emergency Contact',
  'Interview Questionnaire',
  'Payroll Form',
  'Staff Induction Confirmation',
  'Consent to Hold DBS',
  'Application Form',
  'Shadowing Form',
  'Induction Training',
  'DBS ID Form',
  'Lone Working Hazard Checklist',
  'Confidentiality Form',
  'Passport',
  'Visa / BRP',
  'Certificate of Sponsorship',
  'English Language Test',
  'TB Test Certificate',
  'Overseas Police Check',
  'Other',
] as const;

// The courses the company trains against. Caremid counts the LATEST record
// per course name, so a certificate filed as "Adult Safeguarding" when the
// course is "Safeguarding" does not renew anything: it invents a parallel
// course that is always current and leaves the real one expired. Hence a
// fixed list rather than free text.
const COURSES = [
  'Induction Training',
  'Moving & Handling',
  'Medication',
  'Safeguarding',
  'Food Hygiene',
  'Dementia',
  'Understand Your Role',
  'Your Personal Development',
  'Duty of Care',
  'Equality and Diversity',
  'Work in a Person Centred Way',
  'Communication',
  'Privacy and Dignity',
  'Fire Safety',
  'Awareness of mental health',
  'Health and Safety',
  'Infection Prevention and Control',
  'Peg Feed Training',
  'Care Certificate',
] as const;

// What the staff-file screen will actually open. The API does not restrict
// the type, but a .docx filed as evidence is a document an inspector cannot
// read on the spot, so it is refused here and converted first.
const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const MAX_BYTES = 20 * 1024 * 1024;

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
}

interface DocumentRow {
  id: string;
  category: string | null;
  fileName: string;
  size: number;
  expiresAt: string | null;
  createdAt: string;
}

interface TrainingRow {
  id: string;
  userId: string;
  course: string;
  date: string;
  expiresAt: string | null;
}

const fullName = (u: StaffUser) => `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').trim();

/**
 * A person, from a name or an id. Matched exactly and case-insensitively on
 * the full name; two people with the same name are reported rather than
 * guessed between, because the cost of guessing is a document filed in
 * somebody else's staff record.
 */
async function resolveStaff(who: string, signal: AbortSignal): Promise<StaffUser> {
  const users = (await apiGet<StaffUser[]>('users', { active: 'true' }, signal)).filter((u) => u.active);

  const byId = users.find((u) => u.id === who);
  if (byId) return byId;

  const want = who.trim().toLowerCase().replace(/\s+/g, ' ');
  const hits = users.filter((u) => fullName(u).toLowerCase() === want || u.email.toLowerCase() === want);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    throw new Error(
      `${hits.length} active staff are called "${who}" (${hits.map((h) => h.email).join(', ')}). ` +
        'Use the Caremid id instead - caremid_list_staff shows it.',
    );
  }

  const near = users
    .filter((u) => fullName(u).toLowerCase().includes(want.split(' ')[0] ?? ''))
    .slice(0, 5)
    .map(fullName);
  throw new Error(
    `No active staff member called "${who}".` + (near.length ? ` Did you mean: ${near.join(', ')}?` : ''),
  );
}

async function readLocalFile(path: string): Promise<{ bytes: Uint8Array; fileName: string; contentType: string }> {
  if (!isAbsolute(path)) throw new Error('file must be an absolute path.');

  const ext = extname(path).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    throw new Error(
      `A staff file takes a PDF or an image, not "${ext || 'a file with no extension'}". ` +
        'Convert it first - a Word document filed as evidence is one an inspector cannot open on the spot.',
    );
  }

  const info = await stat(path).catch(() => null);
  if (!info || !info.isFile()) throw new Error(`No file at ${path}.`);
  if (info.size > MAX_BYTES) {
    throw new Error(`${basename(path)} is ${Math.round(info.size / 1024 / 1024)}MB; the limit is 20MB.`);
  }

  return { bytes: await readFile(path), fileName: basename(path), contentType };
}

export function registerStaffFileTools(server: McpServer) {
  server.registerTool(
    'caremid_staff_file',
    {
      title: "What is on a staff member's file",
      description:
        'Everything already filed for one person: their documents with the category each is filed under, and their training records with dates. ' +
        'Call this before uploading anything, so a document that is already on file is not added a second time under a slightly different name. ' +
        'For what is MISSING rather than what is present, call caremid_staff_compliance. ' +
        'Example: { staff: "Shazia Zafar" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        response_format: ResponseFormat,
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ staff, response_format }, ctx) => {
      const user = await resolveStaff(staff, ctx.mcpReq.signal);
      const [docs, training] = await Promise.all([
        apiGet<DocumentRow[]>('documents', { ownerType: 'USER', ownerId: user.id }, ctx.mcpReq.signal),
        apiGet<TrainingRow[]>('training', { userId: user.id }, ctx.mcpReq.signal),
      ]);

      const name = fullName(user);
      const data = { staff: name, staffId: user.id, documents: docs, training };

      if (docs.length === 0 && training.length === 0) {
        return result(response_format as Format, `**${name}** has nothing on file yet.`, data);
      }

      const { text } = fitToLimit([0], () =>
        [
          `# ${name}`,
          '',
          `**Documents (${docs.length})**`,
          docs.length ? '' : '_None._',
          ...(docs.length
            ? [
                '| Category | File | Expires |',
                '| --- | --- | --- |',
                ...docs.map((d) => `| ${d.category || '—'} | ${d.fileName} | ${fmtDate(d.expiresAt)} |`),
              ]
            : []),
          '',
          `**Training (${training.length})**`,
          training.length ? '' : '_None._',
          ...(training.length
            ? [
                '| Course | Taken | Expires |',
                '| --- | --- | --- |',
                ...training.map((t) => `| ${t.course} | ${fmtDate(t.date)} | ${fmtDate(t.expiresAt)} |`),
              ]
            : []),
        ].join('\n'),
      );

      return result(response_format as Format, text, data);
    },
  );

  server.registerTool(
    'caremid_file_staff_document',
    {
      title: "File a document on a staff member's record",
      description:
        'Uploads one PDF or image to a staff member and files it under a category, which is what satisfies a Reg 19 staff-file requirement. ' +
        'The category has to be the one Caremid checks for - "Staff Induction Confirmation", not "Induction" - or the document lands where nothing looks for it. ' +
        'A file already on that person under the same category and file name is skipped rather than duplicated, so a part-finished import can simply be run again. ' +
        'Several documents can legitimately share a category (two references, two forms of ID); only an identical name is treated as already done. ' +
        'Only set expires_at from a date printed on the document. A guessed expiry has the file report itself as current when nobody has checked. ' +
        'Example: { staff: "Shazia Zafar", category: "Payroll Form", file: "C:\\\\staff\\\\Shazia Zafar\\\\Payroll Form.pdf" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        category: z.enum(CATEGORIES).describe('The requirement this document satisfies'),
        file: z.string().describe('Absolute path to the PDF or image on this machine'),
        expires_at: isoDate.optional().describe('Only if an expiry date is printed on the document'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds a document. Cannot replace or remove one, and re-running with
        // the same input adds nothing further.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const file = await readLocalFile(args.file);
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      const existing = await apiGet<DocumentRow[]>(
        'documents',
        { ownerType: 'USER', ownerId: user.id },
        ctx.mcpReq.signal,
      );
      const already = existing.find((d) => d.category === args.category && d.fileName === file.fileName);
      if (already) {
        return result(
          args.response_format as Format,
          `Skipped: **${name}** already has **${file.fileName}** filed under ${args.category}.`,
          { skipped: true, reason: 'already on file', staff: name, document: already },
        );
      }

      const created = await apiPostFile<DocumentRow>('documents', file, ctx.mcpReq.signal, {
        ownerType: 'USER',
        ownerId: user.id,
        category: args.category,
        expiresAt: args.expires_at,
      });

      const kb = Math.round(file.bytes.byteLength / 1024);
      return result(
        args.response_format as Format,
        `Filed **${file.fileName}** (${kb} KB) under **${args.category}** for **${name}**.`,
        { skipped: false, staff: name, document: created },
      );
    },
  );

  server.registerTool(
    'caremid_record_training',
    {
      title: 'Record a training certificate',
      description:
        'Records one training course as taken by a staff member on a given date. Use it to load certificates a company already holds on paper. ' +
        'The course must be one Caremid tracks: it counts the most recent record per course name, so a certificate recorded under a name of its own renews nothing and leaves the real course showing as expired. ' +
        'The same course and date recorded twice is skipped, so a part-finished import can be run again. ' +
        'Use the date printed on the certificate, never today and never a guess - the date is what the expiry and the whole training dashboard are computed from. ' +
        'Upload the certificate itself with caremid_file_staff_document under "Training Certificate". ' +
        'Example: { staff: "Shazia Zafar", course: "Moving & Handling", taken_on: "2022-10-28" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        course: z.enum(COURSES).describe('Must be a course Caremid tracks'),
        taken_on: isoDate.describe('The date printed on the certificate'),
        expires_at: isoDate.optional().describe('If the certificate states one. Left unset means no expiry is tracked.'),
        accredited: z.boolean().optional().describe('Whether the certificate is from an accredited provider'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds a training record. Cannot amend or remove one, and the same
        // course on the same date is not recorded twice.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      const existing = await apiGet<TrainingRow[]>('training', { userId: user.id }, ctx.mcpReq.signal);
      const already = existing.find((t) => t.course === args.course && t.date.slice(0, 10) === args.taken_on);
      if (already) {
        return result(
          args.response_format as Format,
          `Skipped: **${name}** already has **${args.course}** recorded for ${fmtDate(args.taken_on)}.`,
          { skipped: true, reason: 'already recorded', staff: name, training: already },
        );
      }

      const created = await apiPost<TrainingRow>(
        'training',
        {
          userId: user.id,
          course: args.course,
          date: args.taken_on,
          expiresAt: args.expires_at ?? null,
          accredited: args.accredited ?? false,
        },
        ctx.mcpReq.signal,
      );

      return result(
        args.response_format as Format,
        `Recorded **${args.course}** for **${name}**, taken ${fmtDate(args.taken_on)}` +
          (args.expires_at ? `, expires ${fmtDate(args.expires_at)}` : '') +
          '.',
        { skipped: false, staff: name, training: created },
      );
    },
  );
}
