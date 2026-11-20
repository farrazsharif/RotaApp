import { format } from 'date-fns';
import { Supervision } from '../api/staffSupervision';
import { SUPERVISION_QUESTIONS, SUPERVISION_OBSERVATIONS, parseMap } from './staffSupervision';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from './printBranding';
import { openPrintable } from './printHtml';

/**
 * The printed Staff Supervision Record.
 *
 * Two jobs, and they pull in opposite directions. A supervision already filled
 * in prints as the completed record, to sign and file. An empty one prints as
 * the form to take into the room - the same questions, with space to write.
 *
 * So a missing answer is never "—" here the way it is on the other printed
 * forms: it is a ruled line. A blank waiting to be filled in by hand is useful
 * on paper; a dash is not.
 *
 * Signatures drawn in the app print as the drawing. Where there is none, the
 * line is left empty to be signed in ink, because that is what happens to this
 * form once it leaves the screen.
 */

interface Opts {
  staffName: string;
  autoPrint?: boolean; // false = readable view only. Default true.
  embed?: boolean; // inline preview: drop the on-page toolbar
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

/** A written answer, or ruled lines to write one on. */
const written = (value: string, lines = 2) =>
  value.trim()
    ? `<div class="answer">${esc(value)}</div>`
    : `<div class="blank">${'<div class="rule"></div>'.repeat(lines)}</div>`;

/** Yes / No with the recorded one ringed, or both open to be circled by hand. */
function yesNo(answer: string): string {
  const on = (want: string) => (answer === want ? ' class="picked"' : '');
  return `<span${on('YES')}>Yes</span> &nbsp;/&nbsp; <span${on('NO')}>No</span>`;
}

export function buildSupervisionHtml(s: Supervision, opts: Opts): string {
  const answers = parseMap(s.answers);
  const observations = parseMap(s.observations);
  const held = s.date ? format(new Date(s.date), 'dd MMM yyyy') : '';
  const next = s.nextReviewDate ? format(new Date(s.nextReviewDate), 'dd MMM yyyy') : '';

  const questionRows = SUPERVISION_QUESTIONS.map(
    (q) => `<tr><td>${esc(q.label)}</td><td class="yn">${yesNo(answers[q.key] || '')}</td></tr>`,
  ).join('');

  const observationBlocks = SUPERVISION_OBSERVATIONS.map(
    (o) => `<div class="obs"><div class="obs-label">${esc(o.label)}</div>${written(observations[o.key] || '', 3)}</div>`,
  ).join('');

  const signature = (data: string | null | undefined) =>
    data ? `<img class="sig-img" src="${data}" alt="" />` : '<div class="sig-space"></div>';

  return `<!DOCTYPE html><html><head><title>Staff Supervision — ${esc(opts.staffName)}</title>
    <style>
      @page { size: portrait; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
      h1 { font-size: 19px; margin: 0 0 2px; }
      .sub { color: #555; font-size: 11px; margin-bottom: 14px; }
      .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      .meta td { border: 1px solid #bbb; padding: 5px 7px; font-size: 12px; }
      .meta td.k { background: #f3f4f6; font-weight: bold; width: 18%; white-space: nowrap; }
      h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #111;
           text-transform: uppercase; letter-spacing: .03em; }
      table.q { width: 100%; border-collapse: collapse; }
      table.q td { border: 1px solid #bbb; padding: 5px 7px; font-size: 12px; }
      table.q td.yn { width: 20%; text-align: center; white-space: nowrap; }
      .picked { font-weight: bold; border: 1.5px solid #111; border-radius: 10px; padding: 1px 7px; }
      .obs { margin-bottom: 11px; }
      .obs-label { font-size: 11px; font-weight: bold; color: #333; margin-bottom: 3px; }
      .answer { font-size: 12px; white-space: pre-wrap; border: 1px solid #ddd; padding: 5px 7px; min-height: 16px; }
      .blank .rule { border-bottom: 1px solid #999; height: 17px; }
      .sigs { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .sigs td { border: 1px solid #bbb; padding: 6px 8px; vertical-align: bottom; width: 50%; }
      .sig-label { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: .03em; }
      .sig-img { max-height: 46px; max-width: 100%; display: block; margin-top: 2px; }
      .sig-space { height: 46px; }
      .sig-name { font-size: 12px; min-height: 15px; }
      .note { margin-top: 12px; font-size: 11px; color: #444; border-left: 3px solid #bbb; padding-left: 8px; }
      .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
      .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
      .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
      @media screen {
        html { background: #eef1f5; }
        body { max-width: 840px; margin: 24px auto; padding: 20px 32px 44px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
      }
      @media print { body { margin: 0; } .no-print { display: none !important; } h2 { page-break-after: avoid; } .obs, .sigs { page-break-inside: avoid; } }
      ${BRANDING_PRINT_CSS}
    </style></head><body>
    ${opts.embed ? '' : `<div class="toolbar no-print">
      <button onclick="window.print()">🖨 Print</button>
      <button class="secondary" onclick="window.close()">Close</button>
    </div>`}
    ${brandingHeaderHtml()}
    <h1>Staff Supervision Record</h1>
    <div class="sub">Supervision is held every 3 months (Policy 1403) · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}</div>

    <table class="meta">
      <tr>
        <td class="k">Staff member</td><td>${esc(opts.staffName)}</td>
        <td class="k">Position</td><td>${esc(s.position || '')}</td>
      </tr>
      <tr>
        <td class="k">Date held</td><td>${esc(held)}</td>
        <td class="k">Next review</td><td>${esc(next)}</td>
      </tr>
    </table>

    <h2>Service Detail</h2>
    <table class="q">${questionRows}</table>

    <h2>Service Users &amp; Days Worked</h2>
    ${written(s.serviceUsers || '', 3)}

    <h2>Observations &amp; Comments</h2>
    ${observationBlocks}

    <h2>Signatures</h2>
    <table class="sigs">
      <tr>
        <td>
          <div class="sig-label">Supervisor / assessor</div>
          <div class="sig-name">${esc(s.assessorName || '')}</div>
          ${signature(s.assessorSignature)}
        </td>
        <td>
          <div class="sig-label">Staff member</div>
          <div class="sig-name">${esc(opts.staffName)}</div>
          ${signature(s.staffSignature)}
        </td>
      </tr>
      <tr>
        <td><div class="sig-label">Date</div><div class="sig-name">${esc(held)}</div></td>
        <td><div class="sig-label">Date</div><div class="sig-name">${esc(held)}</div></td>
      </tr>
    </table>

    ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
    </body></html>`;
}

export function printSupervision(s: Supervision, opts: Opts): void {
  const html = buildSupervisionHtml(s, { ...opts, embed: false });
  openPrintable(html, opts.autoPrint !== false, `Staff Supervision — ${opts.staffName}`);
}

/**
 * The blank form, for a supervision about to be held on paper. Same document
 * with nothing filled in, so what gets written in the room matches what the
 * screen asks for.
 */
export function printBlankSupervision(staffName: string, position?: string | null): void {
  const empty: Supervision = {
    id: '', userId: '', date: '', nextReviewDate: null, position: position || '',
    answers: '{}', serviceUsers: '', observations: '{}',
    assessorName: '', assessorSignature: '', staffSignature: '', source: 'form', note: '',
    createdAt: new Date().toISOString(),
  };
  const html = buildSupervisionHtml(empty, { staffName, embed: false });
  openPrintable(html, true, `Staff Supervision — ${staffName}`);
}
