import { format } from 'date-fns';
import { ServiceUser } from '../types';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from './printBranding';

export interface LikesDislikesPrintData {
  likes: string;
  dislikes: string;
  lifeHistory: string;
  health: string;
  whatPeopleLike: string;
  relationships: string;
  goodDay: string;
  badDay: string;
}

interface PrintOpts {
  autoPrint?: boolean; // false = readable view only (no auto print dialog). Default true.
  createdAt?: string;
  updatedAt?: string;
}

interface BuildOpts {
  createdAt?: string;
  updatedAt?: string;
  // When true, build the document for inline embedding (e.g. an iframe in the
  // modal's read-only view): OMIT the on-page Print/Close toolbar. The layout,
  // branding, styles and fields are otherwise identical to print.
  embed?: boolean;
}

const FIELDS: { key: keyof LikesDislikesPrintData; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'dislikes', label: 'Dislikes' },
  { key: 'lifeHistory', label: 'A Little of My Life History' },
  { key: 'health', label: 'My Health' },
  { key: 'whatPeopleLike', label: 'What Might People Like About Me?' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'goodDay', label: 'What Makes a Good Day for Me' },
  { key: 'badDay', label: 'What Makes a Bad Day for Me' },
];

// Builds the full HTML document for a client's Likes & Dislikes — the same
// layout used for print and for the modal's inline read-only view. Pass
// `embed: true` to drop the print toolbar for inline display. Values are already
// HTML-escaped here; printLikesDislikes (embed defaults to false) then
// opens/optionally prints a window.
export function buildLikesDislikesHtml(serviceUser: ServiceUser, data: LikesDislikesPrintData, opts: BuildOpts = {}): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

  const fieldRows = FIELDS
    .map(({ key, label }) => `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${esc(data[key] || '—')}</div></div>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><title>Likes &amp; Dislikes — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
    <style>
      @page { size: portrait; margin: 15mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      .field { margin-bottom: 14px; }
      .field-label { font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
      .field-value { font-size: 13px; white-space: pre-wrap; margin-top: 3px; }
      .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
      .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
      .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
      /* On screen the document has no page to sit on, so constrain it to a
         readable, centred column that looks like a sheet — printing is
         unaffected (it uses the @page margins above). */
      @media screen {
        html { background: #eef1f5; }
        body { max-width: 840px; margin: 24px auto; padding: 20px 32px 44px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
      }
      @media print { body { margin: 0; } .no-print { display: none !important; } }
      ${BRANDING_PRINT_CSS}
    </style></head><body>
    ${opts.embed ? '' : `<div class="toolbar no-print">
      <button onclick="window.print()">🖨 Print</button>
      <button class="secondary" onclick="window.close()">Close</button>
    </div>`}
    ${brandingHeaderHtml()}
    <h1>Likes &amp; Dislikes</h1>
    <div class="sub">
      ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
      ${opts.createdAt ? ` · Created ${esc(format(new Date(opts.createdAt), 'dd MMM yyyy'))}` : ''}
      ${opts.updatedAt ? ` · Last updated ${esc(format(new Date(opts.updatedAt), 'dd MMM yyyy, h:mm a'))}` : ''}
      · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
    </div>
    ${fieldRows}
    </body></html>`;

  return html;
}

// Opens a printable window for a client's Likes & Dislikes. Shared by the
// Likes & Dislikes modal (its "Print" button) and the history component (viewing
// or printing a past, read-only snapshot). Builds the same document as the
// inline view (via buildLikesDislikesHtml) but with the on-page toolbar and,
// unless disabled, an automatic print.
export function printLikesDislikes(serviceUser: ServiceUser, data: LikesDislikesPrintData, opts: PrintOpts = {}) {
  const autoPrint = opts.autoPrint !== false;
  const html = buildLikesDislikesHtml(serviceUser, data, {
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt,
    embed: false,
  });

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  if (autoPrint) setTimeout(() => w.print(), 300);
}
