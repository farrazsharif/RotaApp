import { OrgSettings } from '../types';

// The company's own branding, cached in a module variable so the synchronous
// print builders (MAR chart, care plan, service plan, call logs, rota, likes &
// dislikes) can stamp each printed form with the company's logo, name and
// address — instead of a hard-coded "Caremid" identity. The portal shell
// (Layout) primes this from the /settings query, so it's populated well before
// anyone opens a print dialog. If it hasn't loaded yet, the header is simply
// omitted and the form still prints.
let cached: OrgSettings | null = null;

export function primePrintBranding(s: OrgSettings | null | undefined): void {
  if (s) cached = s;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

// <style> rules for the branded letterhead. Drop this inside each document's
// existing <style> block once.
export const BRANDING_PRINT_CSS = `
  .brand-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
  .brand-header .brand-logo { max-height: 60px; max-width: 200px; object-fit: contain; }
  .brand-header .brand-info { line-height: 1.35; }
  .brand-header .brand-name { font-size: 16px; font-weight: bold; color: #111; margin: 0; }
  .brand-header .brand-meta { font-size: 11px; color: #444; white-space: pre-line; margin: 0; }
`;

// The company letterhead block for the top of a printed form: logo (if set),
// company name, address, contact and regulatory numbers. Returns '' when no
// branding has loaded yet, so the form still prints without a header.
export function brandingHeaderHtml(): string {
  const b = cached;
  if (!b || !b.companyName) return '';
  const contact = [b.phone && `Tel: ${b.phone}`, b.email].filter(Boolean).join('  ·  ');
  const reg = [b.cqcProviderId && `CQC: ${b.cqcProviderId}`, b.icoNumber && `ICO: ${b.icoNumber}`].filter(Boolean).join('  ·  ');
  return `<div class="brand-header">
    ${b.logo ? `<img class="brand-logo" src="${b.logo}" alt="" />` : ''}
    <div class="brand-info">
      <p class="brand-name">${esc(b.companyName)}</p>
      ${b.address ? `<p class="brand-meta">${esc(b.address)}</p>` : ''}
      ${contact ? `<p class="brand-meta">${esc(contact)}</p>` : ''}
      ${reg ? `<p class="brand-meta">${esc(reg)}</p>` : ''}
    </div>
  </div>`;
}
