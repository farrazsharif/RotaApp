import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { apiGet, apiPost, apiPut, apiDelete, apiPostFile } from '../api.js';
import { Format, ResponseFormat, fitToLimit, fmtDate, isoDate, result } from '../shared.js';

/**
 * The staff file (Reg 19).
 *
 * The write tools here add: a document filed against a requirement, a
 * training certificate, a refresher. They skip what is already on file, so
 * running an import twice leaves the file as the first run left it.
 *
 * caremid_correct_training_date is the one that amends, and it is narrow by
 * design: one named person, one exact date moved to another, recomputing the
 * expiry. It exists because recording a corrected date as a NEW session would
 * leave the wrong one underneath, and a training record showing two sessions
 * where there was one is worse than the wrong date.
 *
 * caremid_remove_staff_document is the one that deletes, and it can only
 * remove a document the AGENT uploaded. Anything a person filed is refused
 * outright, however exactly the name matches - that restriction is what makes
 * a deleting tool safe to hand over at all. The copy in Dropbox is untouched,
 * so a mistake means filing it again rather than losing it.
 *
 * caremid_record_paper_supervision backdates a supervision, which is how a
 * supervision dashboard comes to show a conversation nobody had - so it is
 * the one tool that cannot act on what it is told. The date is read from the
 * signed form's own file name, the form is filed on the staff record first,
 * and the server refuses the entry unless that document is there. The
 * evidence is the argument; the tool only transcribes it.
 *
 * What is still not here: spot checks, and writing a supervision from
 * scratch. A full supervision has answers, observations and two signatures on
 * it, and nothing in a folder can stand in for those.
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
  'Supervision Record',
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

// The only categories that hold more than one document. Two references and
// two forms of ID are the normal case, training certificates accumulate, and
// Other is a drawer. Everywhere else a second document is a duplicate: there
// is one offer letter, one contract, one payroll form.
const MULTI_DOCUMENT = new Set<string>(['Reference', 'ID', 'Training Certificate', 'Other']);

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
  uploadedById: string | null;
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
  return matchStaff(who, await activeStaff(signal));
}

async function activeStaff(signal: AbortSignal): Promise<StaffUser[]> {
  return (await apiGet<StaffUser[]>('users', { active: 'true' }, signal)).filter((u) => u.active);
}

/** The matching half of resolveStaff, against a list already in hand. */
function matchStaff(who: string, users: StaffUser[]): StaffUser {
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

/**
 * The day a supervision was held, taken from the name of the signed form.
 *
 * Day first - "03.11.2025" is the third of November, which is how every form
 * in the staff files and every row of the office tracker is written.
 *
 * The date comes from the document rather than from whoever is calling, so
 * the record and the evidence cannot drift apart. That only works if the name
 * says one thing: no date, or two different ones, is refused rather than
 * picked between.
 */
function dateFromFormName(fileName: string): string {
  const found = new Set<string>();
  for (const m of fileName.matchAll(/(\d{1,2})[-._](\d{1,2})[-._](\d{4})/g)) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) continue; // 31 February
    found.add(dt.toISOString().slice(0, 10));
  }
  if (found.size === 1) return [...found][0];
  if (found.size > 1) {
    throw new Error(
      `"${fileName}" has more than one date in its name (${[...found].map(fmtDate).join(', ')}), so which day it ` +
        'was held is not clear. Rename it, or record this one by hand.',
    );
  }
  throw new Error(
    `"${fileName}" has no date in its name, and the date is read from the form rather than supplied. ` +
      'Rename it to include the day it was held, or record this one by hand.',
  );
}

/** Three months on, for the next-due date. Matches what the server works out. */
function plusMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
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
    'caremid_file_staff_documents',
    {
      title: "File documents on a staff member's record",
      description:
        'Files PDFs or images against ONE staff member, each under the category that satisfies a Reg 19 staff-file requirement. ' +
        'Takes up to 20 at a time because a staff file is loaded a folder at a time, not a page at a time. ' +
        'The category has to be the one Caremid checks for - "Staff Induction Confirmation", not "Induction" - or the document lands where nothing looks for it. ' +
        'Nothing is filed twice: a document is skipped if the same bytes are already on that person under any name, if the same file name is already in that category, or if the category holds only one document and already has one. ' +
        'Duplicates WITHIN the batch are skipped the same way, so the same page listed twice goes in once. ' +
        'A part-finished run can simply be repeated, and only References, ID, Training Certificate and Other ever accumulate more than one file. ' +
        'Only set expires_at from a date printed on the document: a guessed expiry has the file report itself as current when nobody has checked. ' +
        'Every document is reported back as filed, skipped or failed - one bad path does not stop the rest. ' +
        'Example: { staff: "Shazia Zafar", documents: [{ category: "Payroll Form", file: "C:\\staff\\Shazia Zafar\\Payroll Form.pdf" }] }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        documents: z
          .array(
            z.strictObject({
              category: z.enum(CATEGORIES).describe('The requirement this document satisfies'),
              file: z.string().describe('Absolute path to the PDF or image on this machine'),
              expires_at: isoDate.optional().describe('Only if an expiry date is printed on the document'),
            }),
          )
          .min(1)
          .max(20)
          .describe('The documents to file, all for the one staff member'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds documents. Cannot replace or remove one, and re-running with
        // the same input adds nothing further.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      // Read once for the whole batch, then kept up to date as each document
      // goes in - otherwise two copies of the same page in one call would
      // both pass the check and both land.
      const onFile = await apiGet<DocumentRow[]>(
        'documents',
        { ownerType: 'USER', ownerId: user.id },
        ctx.mcpReq.signal,
      );

      const filed: { file: string; category: string; kb: number }[] = [];
      const skipped: { file: string; why: string }[] = [];
      const failed: { file: string; why: string }[] = [];

      for (const want of args.documents) {
        let file;
        try {
          file = await readLocalFile(want.file);
        } catch (e) {
          failed.push({ file: basename(want.file), why: (e as Error).message });
          continue;
        }

        // Byte-for-byte the same file, wherever it is filed. This is the one
        // that catches the same document saved under another name.
        const sameBytes = onFile.find((d) => d.size === file.bytes.byteLength);
        if (sameBytes) {
          skipped.push({
            file: file.fileName,
            why: `already on file as ${sameBytes.fileName}${sameBytes.category ? ` under ${sameBytes.category}` : ''}`,
          });
          continue;
        }

        const sameName = onFile.find((d) => d.category === want.category && d.fileName === file.fileName);
        if (sameName) {
          skipped.push({ file: file.fileName, why: `already filed under ${want.category}` });
          continue;
        }

        // A category that only ever holds one thing, and it is already held.
        // Replacing it is not this tool's job.
        if (!MULTI_DOCUMENT.has(want.category)) {
          const held = onFile.find((d) => d.category === want.category);
          if (held) {
            skipped.push({
              file: file.fileName,
              why: `${want.category} already holds ${held.fileName}, and only one is expected`,
            });
            continue;
          }
        }

        try {
          const created = await apiPostFile<DocumentRow>('documents', file, ctx.mcpReq.signal, {
            ownerType: 'USER',
            ownerId: user.id,
            category: want.category,
            expiresAt: want.expires_at,
          });
          onFile.push(created);
          filed.push({ file: file.fileName, category: want.category, kb: Math.round(file.bytes.byteLength / 1024) });
        } catch (e) {
          failed.push({ file: file.fileName, why: (e as Error).message });
        }
      }

      const lines = [
        `**${name}** — ${filed.length} filed, ${skipped.length} skipped, ${failed.length} failed.`,
      ];
      if (filed.length) {
        lines.push('', '**Filed**', ...filed.map((f) => `- ${f.file} → ${f.category} (${f.kb} KB)`));
      }
      if (skipped.length) {
        lines.push('', '**Skipped**', ...skipped.map((f) => `- ${f.file} — ${f.why}`));
      }
      if (failed.length) {
        lines.push('', '**Failed**', ...failed.map((f) => `- ${f.file} — ${f.why}`));
      }

      return result(args.response_format as Format, lines.join('\n'), {
        staff: name,
        filed,
        skipped,
        failed,
      });
    },
  );

  server.registerTool(
    'caremid_correct_training_date',
    {
      title: 'Correct the date on training already recorded',
      description:
        'Moves the training records of ONE staff member from one date to another, in place, and recomputes the expiry a year on. ' +
        'For one case only: training recorded against the wrong day. Recording the right day as a NEW refresher instead would leave the wrong one underneath as history, so the record would show two sessions when there was one - which on a training record an inspector reads is worse than the wrong date. ' +
        'Every tool beside this one only adds. This one amends, so it is deliberately narrow: one named person, one exact date moved to one other date, nothing else touched. It cannot delete a record, change a course, or set a date on anything it was not pointed at. ' +
        'Runs as a dry run unless apply is true, so what would change can be read before it does. ' +
        'Only use it to correct a date that is demonstrably wrong - moving training later because it has expired is falsifying a compliance record. ' +
        'Example: { staff: "Nasim Malik", from_date: "2026-07-15", to_date: "2026-07-21" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        from_date: isoDate.describe('The date currently recorded, which must match exactly'),
        to_date: isoDate.describe('The date it should read'),
        apply: z
          .boolean()
          .default(false)
          .describe('false lists what would change and changes nothing; true makes the change'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Amends existing records. The only tool here that does.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      const all = await apiGet<TrainingRow[]>('training', { userId: user.id }, ctx.mcpReq.signal);
      const hits = all.filter((t) => t.date.slice(0, 10) === args.from_date);
      if (hits.length === 0) {
        return result(
          args.response_format as Format,
          `**${name}** has no training recorded on ${fmtDate(args.from_date)}, so there is nothing to correct.`,
          { staff: name, matched: 0, changed: 0 },
        );
      }

      const expires = new Date(`${args.to_date}T00:00:00.000Z`);
      expires.setUTCFullYear(expires.getUTCFullYear() + 1);
      const expiresAt = expires.toISOString().slice(0, 10);

      if (!args.apply) {
        return result(
          args.response_format as Format,
          [
            `**${name}** — ${hits.length} record${hits.length === 1 ? '' : 's'} would move from ` +
              `${fmtDate(args.from_date)} to ${fmtDate(args.to_date)}, expiring ${fmtDate(expiresAt)}.`,
            '',
            ...hits.map((t) => `- ${t.course}`),
            '',
            '_Nothing changed. Call again with apply: true._',
          ].join('\n'),
          { staff: name, matched: hits.length, changed: 0, courses: hits.map((t) => t.course), to_date: args.to_date, expires_at: expiresAt },
        );
      }

      const changed: string[] = [];
      const failed: { course: string; why: string }[] = [];
      for (const t of hits) {
        try {
          await apiPut(`training/${t.id}`, { date: args.to_date, expiresAt }, ctx.mcpReq.signal);
          changed.push(t.course);
        } catch (e) {
          failed.push({ course: t.course, why: (e as Error).message });
        }
      }

      const lines = [
        `**${name}** — ${changed.length} record${changed.length === 1 ? '' : 's'} moved to ` +
          `${fmtDate(args.to_date)}, expiring ${fmtDate(expiresAt)}.`,
      ];
      if (failed.length) lines.push('', '**Failed**', ...failed.map((f) => `- ${f.course} — ${f.why}`));

      return result(args.response_format as Format, lines.join('\n'), {
        staff: name,
        matched: hits.length,
        changed: changed.length,
        courses: changed,
        failed,
        to_date: args.to_date,
        expires_at: expiresAt,
      });
    },
  );

  server.registerTool(
    'caremid_remove_staff_document',
    {
      title: 'Remove a document the agent filed',
      description:
        'Deletes one document from a staff file, by exact file name. For superseded paperwork: a certificate filed against a date that later turned out to be wrong, where leaving both would show two certificates and no way to tell which counts. ' +
        'It will only remove a document the AGENT uploaded. Anything a person put there is refused outright, whatever the name matches - that is the guarantee that makes a deleting tool safe to hand over at all. ' +
        'The file is gone for good: there is no undo, and the stored copy goes with the record. The file in Dropbox is untouched, so a mistake means filing it again rather than losing it. ' +
        'A name matching more than one document is reported rather than guessed between. ' +
        'Runs as a dry run unless apply is true. ' +
        'Example: { staff: "Shazia Zafar", file_name: "Refresher Training Shazia Zafar 15-07-2026.pdf" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        file_name: z.string().min(1).max(260).describe('Exactly as caremid_staff_file shows it'),
        apply: z
          .boolean()
          .default(false)
          .describe('false says what would be removed and removes nothing; true removes it'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Deletes. The only tool here that does.
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const [me, user] = await Promise.all([
        apiGet<{ id: string }>('auth/me', {}, ctx.mcpReq.signal),
        resolveStaff(args.staff, ctx.mcpReq.signal),
      ]);
      const name = fullName(user);

      const docs = await apiGet<DocumentRow[]>(
        'documents',
        { ownerType: 'USER', ownerId: user.id },
        ctx.mcpReq.signal,
      );
      const hits = docs.filter((d) => d.fileName === args.file_name);

      if (hits.length === 0) {
        throw new Error(
          `**${name}** has no document called "${args.file_name}". caremid_staff_file shows the exact names.`,
        );
      }
      if (hits.length > 1) {
        throw new Error(
          `${hits.length} of ${name}'s documents are called "${args.file_name}". Remove them in Caremid, where they can be told apart.`,
        );
      }

      const doc = hits[0];
      // The guarantee. Anything a person filed is not this tool's business,
      // however exactly the name matches.
      if (doc.uploadedById !== me.id) {
        throw new Error(
          `"${doc.fileName}" on ${name} was filed by somebody else, so this will not remove it. ` +
            'Only documents the agent uploaded can be removed here; anything else goes through Caremid, by a person who can see what they are deleting.',
        );
      }

      if (!args.apply) {
        return result(
          args.response_format as Format,
          `Would remove **${doc.fileName}** (${Math.round(doc.size / 1024)} KB` +
            `${doc.category ? `, filed under ${doc.category}` : ''}) from **${name}**.` +
            `\n\n_Nothing changed. Call again with apply: true._`,
          { staff: name, document: doc, removed: false },
        );
      }

      await apiDelete(`documents/${doc.id}`, ctx.mcpReq.signal);
      return result(
        args.response_format as Format,
        `Removed **${doc.fileName}** from **${name}**. The copy in Dropbox is untouched.`,
        { staff: name, document: doc, removed: true },
      );
    },
  );

  server.registerTool(
    'caremid_refresh_training',
    {
      title: 'Record an annual refresher',
      description:
        'Records the annual refresher for ONE staff member: every course they currently hold is renewed from the date given, expiring a year later. ' +
        'This is the normal way a year of training is recorded, because one refresher day covers the whole mandatory set rather than a course at a time. ' +
        'Previous records are kept, so the year-by-year history stays intact and only the newest record per course counts as current. ' +
        'It renews what the person ALREADY holds - somebody with no training records yet is reported back rather than invented, and their courses have to be recorded first with caremid_record_training. ' +
        'Use the date on the refresher certificate, never today and never a guess: it is what the next-due date and the whole training dashboard are computed from, and a date nobody attended is a compliance record that is simply untrue. ' +
        'Example: { staff: "Usman Munir", held_on: "2026-04-06" }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        held_on: isoDate.describe('The date the refresher was held, from the certificate'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds a fresh record per course and leaves the old ones in place as
        // history. Running it twice for the same date renews to the same
        // date again, which leaves the register saying what it already said.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      const before = await apiGet<TrainingRow[]>('training', { userId: user.id }, ctx.mcpReq.signal);
      const courses = new Set(before.map((t) => t.course));
      if (courses.size === 0) {
        throw new Error(
          `${name} holds no training courses yet, so there is nothing to refresh. ` +
            'Record the courses they hold first with caremid_record_training.',
        );
      }

      const done = await apiPost<{ count?: number }>(
        'training/refresh',
        { userId: user.id, date: args.held_on },
        ctx.mcpReq.signal,
      );

      const due = new Date(args.held_on);
      due.setFullYear(due.getFullYear() + 1);
      const renewed = done.count ?? courses.size;

      return result(
        args.response_format as Format,
        `Renewed **${renewed}** course${renewed === 1 ? '' : 's'} for **${name}** from ${fmtDate(args.held_on)}. ` +
          `Next due ${fmtDate(due.toISOString())}.`,
        { staff: name, renewed, held_on: args.held_on, next_due: due.toISOString().slice(0, 10) },
      );
    },
  );

  server.registerTool(
    'caremid_record_training',
    {
      title: 'Record training certificates',
      description:
        'Records courses as taken by ONE staff member on the dates their certificates give. Use it to load the training a company already holds on paper, and to set up somebody with no records yet so a refresher has something to renew. ' +
        'Up to 25 courses at a time, because a carer holds a whole mandatory set rather than one certificate. ' +
        'Each course must be one Caremid tracks: it counts the most recent record per course name, so a certificate recorded under a name of its own renews nothing and leaves the real course showing as expired. ' +
        'Expiry defaults to one year after the date taken, which is what Caremid does everywhere else; give expires_at only where a certificate states something different. ' +
        'The same course on the same date is skipped rather than duplicated, so a part-finished run can be repeated. ' +
        'Use the date printed on the certificate, never today and never a guess - it is what the expiry and the whole training dashboard are computed from. ' +
        'Example: { staff: "M Hamad Khalid", courses: [{ course: "Moving & Handling", taken_on: "2025-05-01" }] }',
      inputSchema: z.strictObject({
        staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
        courses: z
          .array(
            z.strictObject({
              course: z.enum(COURSES).describe('Must be a course Caremid tracks'),
              taken_on: isoDate.describe('The date printed on the certificate'),
              expires_at: isoDate
                .optional()
                .describe('Only if the certificate states one. Otherwise a year after taken_on.'),
              accredited: z.boolean().optional().describe('Whether the provider is accredited'),
            }),
          )
          .min(1)
          .max(25)
          .describe('The courses to record, all for the one staff member'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds records. Cannot amend or remove one, and the same course on
        // the same date is not recorded twice.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const user = await resolveStaff(args.staff, ctx.mcpReq.signal);
      const name = fullName(user);

      // Read once and keep updated, so the same course twice in one batch is
      // caught as well as one already on the record.
      const held = await apiGet<TrainingRow[]>('training', { userId: user.id }, ctx.mcpReq.signal);
      const seen = new Set(held.map((t) => `${t.course}@${t.date.slice(0, 10)}`));

      const recorded: { course: string; taken_on: string; expires_at: string }[] = [];
      const skipped: { course: string; why: string }[] = [];
      const failed: { course: string; why: string }[] = [];

      for (const want of args.courses) {
        const key = `${want.course}@${want.taken_on}`;
        if (seen.has(key)) {
          skipped.push({ course: want.course, why: `already recorded for ${fmtDate(want.taken_on)}` });
          continue;
        }

        // A year, matching refreshTraining and the spreadsheet import. A
        // record with no expiry at all would read as permanently current,
        // which is the one answer that is certainly wrong.
        let expires = want.expires_at;
        if (!expires) {
          const d = new Date(`${want.taken_on}T00:00:00.000Z`);
          d.setUTCFullYear(d.getUTCFullYear() + 1);
          expires = d.toISOString().slice(0, 10);
        }

        try {
          await apiPost<TrainingRow>(
            'training',
            {
              userId: user.id,
              course: want.course,
              date: want.taken_on,
              expiresAt: expires,
              accredited: want.accredited ?? false,
            },
            ctx.mcpReq.signal,
          );
          seen.add(key);
          recorded.push({ course: want.course, taken_on: want.taken_on, expires_at: expires });
        } catch (e) {
          failed.push({ course: want.course, why: (e as Error).message });
        }
      }

      const lines = [`**${name}** — ${recorded.length} recorded, ${skipped.length} skipped, ${failed.length} failed.`];
      if (recorded.length) {
        lines.push(
          '',
          '| Course | Taken | Expires |',
          '| --- | --- | --- |',
          ...recorded.map((r) => `| ${r.course} | ${fmtDate(r.taken_on)} | ${fmtDate(r.expires_at)} |`),
        );
      }
      if (skipped.length) lines.push('', '**Skipped**', ...skipped.map((r) => `- ${r.course} — ${r.why}`));
      if (failed.length) lines.push('', '**Failed**', ...failed.map((r) => `- ${r.course} — ${r.why}`));

      return result(args.response_format as Format, lines.join('\n'), {
        staff: name,
        recorded,
        skipped,
        failed,
      });
    },
  );

  server.registerTool(
    'caremid_record_paper_supervision',
    {
      title: 'Record a supervision that was held on paper',
      description:
        'Puts a supervision held on paper onto the carer record, from the signed form itself. The date is read ' +
        'FROM THE FILE NAME rather than supplied, so the record cannot claim a different day from the document ' +
        'behind it, and a form whose name carries no date (or two) is refused rather than guessed at. The form is ' +
        'filed under Supervision Record first and the entry points at it; Caremid refuses the entry outright if ' +
        'that document is not on the file, so a supervision cannot be logged without the evidence for it. The ' +
        'next one falls due three months later, which for a historic form is a date already past - that is the ' +
        'true position, not a failure. A date already on the record is skipped, so running it twice changes ' +
        'nothing. Runs as a dry run unless apply is true. Example: { supervisions: [{ staff: "Shama Aslam", ' +
        'file: "C:/Users/me/Dropbox/Staff Files/Shama Aslam/Staff Supervision 03-11-2025.pdf" }], apply: true }',
      inputSchema: z.strictObject({
        supervisions: z
          .array(
            z.strictObject({
              staff: z.string().min(2).max(120).describe('Full name, email, or Caremid id'),
              file: z
                .string()
                .min(3)
                .max(400)
                .describe('Absolute path to the signed supervision form (PDF). Its name must carry the date held.'),
            }),
          )
          .min(1)
          .max(50)
          .describe('One row per carer; several carers in one call is fine'),
        assessor: z
          .string()
          .max(120)
          .optional()
          .describe('Who carried them out, if it is the same person for all of them'),
        apply: z.boolean().default(false).describe('false says what would be recorded and records nothing'),
        response_format: ResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        // Adds a record and the document behind it. Amends nothing, removes
        // nothing, and the same date twice is skipped.
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const signal = ctx.mcpReq.signal;
      const today = new Date().toISOString().slice(0, 10);

      // Read both lists once for the whole batch. Thirty-seven carers is one
      // call, not thirty-seven.
      const [users, already] = await Promise.all([
        activeStaff(signal),
        apiGet<{ userId: string; date: string }[]>('staff-supervision', {}, signal),
      ]);
      const held = new Set(already.map((s) => `${s.userId}@${String(s.date).slice(0, 10)}`));

      type Planned = { user: StaffUser; file: Awaited<ReturnType<typeof readLocalFile>>; date: string };
      const planned: Planned[] = [];
      const skipped: { who: string; why: string }[] = [];
      const failed: { who: string; why: string }[] = [];

      for (const row of args.supervisions) {
        let user: StaffUser;
        try {
          user = matchStaff(row.staff, users);
        } catch (e) {
          failed.push({ who: row.staff, why: (e as Error).message });
          continue;
        }
        const who = fullName(user);

        try {
          const file = await readLocalFile(row.file);
          if (file.contentType !== 'application/pdf') {
            throw new Error(`${file.fileName} is not a PDF; a signed supervision form has to be the scan itself.`);
          }
          const date = dateFromFormName(file.fileName);
          if (date > today) throw new Error(`${file.fileName} is dated ${fmtDate(date)}, which is in the future.`);
          if (held.has(`${user.id}@${date}`)) {
            skipped.push({ who, why: `a supervision on ${fmtDate(date)} is already on the record` });
            continue;
          }
          // Two rows in one batch for the same carer and day.
          if (planned.some((p) => p.user.id === user.id && p.date === date)) {
            skipped.push({ who, why: `${fmtDate(date)} appears twice in this batch` });
            continue;
          }
          planned.push({ user, file, date });
        } catch (e) {
          failed.push({ who, why: (e as Error).message });
        }
      }

      const table = (rows: Planned[]) => [
        '| Carer | Held | Next due | Signed form |',
        '| --- | --- | --- | --- |',
        ...rows.map(
          (p) => `| ${fullName(p.user)} | ${fmtDate(p.date)} | ${fmtDate(plusMonths(p.date, 3))} | ${p.file.fileName} |`,
        ),
      ];

      if (!args.apply) {
        const lines = [
          `**${planned.length}** supervision${planned.length === 1 ? '' : 's'} would be recorded` +
            `${skipped.length ? `, ${skipped.length} skipped` : ''}${failed.length ? `, ${failed.length} refused` : ''}.`,
        ];
        if (planned.length) lines.push('', ...table(planned));
        if (skipped.length) lines.push('', '**Skipped**', ...skipped.map((s) => `- ${s.who} — ${s.why}`));
        if (failed.length) lines.push('', '**Refused**', ...failed.map((s) => `- ${s.who} — ${s.why}`));
        lines.push('', '_Nothing changed. Call again with apply: true._');
        return result(args.response_format as Format, lines.join('\n'), {
          applied: false,
          would_record: planned.map((p) => ({ staff: fullName(p.user), date: p.date, form: p.file.fileName })),
          skipped,
          failed,
        });
      }

      const docsByUser = new Map<string, DocumentRow[]>();
      const recorded: Planned[] = [];

      for (const p of planned) {
        const who = fullName(p.user);
        try {
          let docs = docsByUser.get(p.user.id);
          if (!docs) {
            docs = await apiGet<DocumentRow[]>('documents', { ownerType: 'USER', ownerId: p.user.id }, signal);
            docsByUser.set(p.user.id, docs);
          }

          // The form has to be on the file before the entry can name it. An
          // exact name match means a previous run already filed it - matching
          // on size instead could point the record at an unrelated document
          // of the same length, which is the one mistake worth avoiding here.
          let form = docs.find((d) => d.fileName === p.file.fileName);
          if (!form) {
            form = await apiPostFile<DocumentRow>('documents', p.file, signal, {
              ownerType: 'USER',
              ownerId: p.user.id,
              category: 'Supervision Record',
            });
            docs.push(form);
          }

          await apiPost(
            'staff-supervision',
            {
              userId: p.user.id,
              date: p.date,
              source: 'paper',
              evidenceFileName: form.fileName,
              assessorName: args.assessor,
              note: 'Supervision held on paper; the signed form is filed on this record.',
            },
            signal,
          );
          held.add(`${p.user.id}@${p.date}`);
          recorded.push(p);
        } catch (e) {
          failed.push({ who, why: (e as Error).message });
        }
      }

      const lines = [
        `**${recorded.length}** supervision${recorded.length === 1 ? '' : 's'} recorded` +
          `${skipped.length ? `, ${skipped.length} skipped` : ''}${failed.length ? `, ${failed.length} failed` : ''}.`,
      ];
      if (recorded.length) lines.push('', ...table(recorded));
      if (skipped.length) lines.push('', '**Skipped**', ...skipped.map((s) => `- ${s.who} — ${s.why}`));
      if (failed.length) lines.push('', '**Failed**', ...failed.map((s) => `- ${s.who} — ${s.why}`));

      return result(args.response_format as Format, lines.join('\n'), {
        applied: true,
        recorded: recorded.map((p) => ({
          staff: fullName(p.user),
          date: p.date,
          next_due: plusMonths(p.date, 3),
          form: p.file.fileName,
        })),
        skipped,
        failed,
      });
    },
  );

}
