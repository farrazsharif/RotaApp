import { format } from 'date-fns';
import { ServiceUser } from '../types';
import { defaultTemplateSections, keyForItem, PspItem, PspSection } from './servicePlanSchema';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from './printBranding';

type YnVal = { v: '' | 'YES' | 'NO'; comment: string; action?: string };
type CheckVal = { checked: boolean; comment: string };
type CapVal = { independent: boolean; supervise: boolean; staff: string; aid: string };
type SigVal = { dataUrl: string; name: string; date: string };
type MhEquipVal = {
  turnplate: boolean; slideSheet: boolean; handlingBelt: boolean; rotunder: boolean; other: boolean;
  hoistModel: string; bathHoistModel: string; standAidModel: string; otherDetail: string;
};
type EquipVal = {
  suppliedBy: string; servicingBy: string; contractorNumber: string;
  make: string; model: string; serviceNo: string; lastService: string; nextDue: string;
};

interface PrintOpts {
  // false = readable view only (no auto print dialog). Default true.
  autoPrint?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // The template to render; defaults to the built-in default when omitted.
  sections?: PspSection[];
  // When printing a signed snapshot, show an audit banner marking it immutable.
  signed?: { label?: string | null; signedByName?: string | null; signedOn: string; signedBy: string };
}

// Opens a printable window for a service user's Personal Service Plan.
// Shared by the plan modal, "Open" (readable view) and "Print" on the list.
export function printServicePlan(serviceUser: ServiceUser, values: Record<string, unknown>, opts: PrintOpts = {}) {
  const autoPrint = opts.autoPrint !== false;
  const yn = (key: string): YnVal => (values[key] as YnVal) || { v: '', comment: '', action: '' };
  const chk = (key: string): CheckVal => (values[key] as CheckVal) || { checked: false, comment: '' };
  const cap = (key: string): CapVal => (values[key] as CapVal) || { independent: false, supervise: false, staff: '', aid: '' };
  const str = (key: string): string => (values[key] as string) || '';
  const sig = (key: string): SigVal => (values[key] as SigVal) || { dataUrl: '', name: '', date: '' };
  const mhe = (key: string): MhEquipVal => (values[key] as MhEquipVal) ||
    { turnplate: false, slideSheet: false, handlingBelt: false, rotunder: false, other: false, hoistModel: '', bathHoistModel: '', standAidModel: '', otherDetail: '' };
  const eqp = (key: string): EquipVal => (values[key] as EquipVal) ||
    { suppliedBy: '', servicingBy: '', contractorNumber: '', make: '', model: '', serviceNo: '', lastService: '', nextDue: '' };

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

  function itemHtml(section: PspSection, item: PspItem, idx: number): string {
    const key = keyForItem(item, section.id, idx);
    const type = item.type || 'yn';

    if (type === 'yn') {
      const v = yn(key);
      return `<div class="item">
        <div class="item-row"><span>${esc(item.label)}</span><b class="${v.v === 'YES' ? 'yes' : v.v === 'NO' ? 'no' : 'blank'}">${v.v || '—'}</b></div>
        ${v.comment ? `<div class="note">Comment: ${esc(v.comment)}</div>` : ''}
        ${section.action && v.action ? `<div class="note">Action: ${esc(v.action)}</div>` : ''}
      </div>`;
    }
    if (type === 'check') {
      const v = chk(key);
      return `<div class="item">
        <div class="item-row"><span>${v.checked ? '☑' : '☐'} ${esc(item.label)}</span></div>
        ${v.comment ? `<div class="note">Comment: ${esc(v.comment)}</div>` : ''}
      </div>`;
    }
    if (type === 'choice') {
      const v = str(key);
      return `<div class="item"><div class="item-row"><span>${esc(item.label)}</span><b>${esc(v || '—')}</b></div></div>`;
    }
    if (type === 'capability') {
      const v = cap(key);
      const parts = [v.independent && 'Independent', v.supervise && 'Supervise', v.staff && `Staff: ${v.staff}`, v.aid && `Aid: ${v.aid}`].filter(Boolean);
      return `<div class="item"><div class="item-row"><span>${esc(item.label)}</span><span>${esc(parts.join(' · ') || '—')}</span></div></div>`;
    }
    if (type === 'signature') {
      const v = sig(key);
      return `<div class="item">
        <div class="note">${esc(item.label)}</div>
        ${v.dataUrl ? `<img class="sig" src="${v.dataUrl}" />` : '<div class="note">Not signed</div>'}
        <div class="note">${[v.name, v.date].filter(Boolean).map(esc).join(' · ')}</div>
      </div>`;
    }
    if (type === 'mhEquipment') {
      const v = mhe(key);
      const checked = ([['turnplate', 'Turnplate'], ['slideSheet', 'Slide Sheet'], ['handlingBelt', 'Handling Belt'], ['rotunder', 'Rotunder'], ['other', 'Other']] as const)
        .filter(([k]) => v[k]).map(([, label]) => label);
      const texts = ([['hoistModel', 'Hoist'], ['bathHoistModel', 'Bath Hoist'], ['standAidModel', 'Stand Aid'], ['otherDetail', 'Other']] as const)
        .filter(([k]) => v[k]).map(([k, label]) => `${label}: ${v[k]}`);
      return `<div class="item"><div class="item-row"><span>${esc([...checked, ...texts].join(' · ') || '—')}</span></div></div>`;
    }
    if (type === 'equipment') {
      const v = eqp(key);
      const parts = [v.suppliedBy && `Supplied: ${v.suppliedBy}`, v.servicingBy && `Servicing: ${v.servicingBy}`, v.make && `Make: ${v.make}`, v.model && `Model: ${v.model}`, v.serviceNo && `Service no: ${v.serviceNo}`, v.lastService && `Last service: ${v.lastService}`, v.nextDue && `Next due: ${v.nextDue}`, v.contractorNumber && `Contractor: ${v.contractorNumber}`].filter(Boolean);
      return `<div class="item"><div class="note">${esc(item.label)}</div><div class="item-row"><span>${esc(parts.join(' · ') || '—')}</span></div></div>`;
    }
    // text / longtext
    const v = str(key);
    return `<div class="item"><div class="note">${esc(item.label)}</div><div class="item-row"><span>${esc(v || '—')}</span></div></div>`;
  }

  const templateSections = opts.sections?.length ? opts.sections : defaultTemplateSections();
  const sectionsHtml = templateSections.map((s) => `
    <div class="section">
      <h2>${esc(s.title)}</h2>
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
      ${s.note ? `<p class="note-box">${esc(s.note)}</p>` : ''}
      ${s.items.map((item, i) => itemHtml(s, item, i)).join('')}
    </div>
  `).join('');

  const html = `<!DOCTYPE html><html><head><title>Personal Service Plan — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
    <style>
      @page { size: portrait; margin: 15mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      .signed-banner { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; font-size: 11px; padding: 8px 10px; border-radius: 6px; margin: 8px 0 10px; line-height: 1.5; }
      .section { page-break-inside: avoid; margin-bottom: 14px; }
      h2 { font-size: 14px; margin: 0 0 6px; background: #f3f3f3; padding: 5px 8px; }
      .intro { font-size: 11px; color: #555; margin: 0 0 6px; }
      .note-box { font-size: 10px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; padding: 6px; margin: 0 0 6px; }
      .item { border-bottom: 1px solid #eee; padding: 4px 0; }
      .item-row { display: flex; justify-content: space-between; gap: 10px; }
      .item-row b.yes { color: #15803d; }
      .item-row b.no { color: #b91c1c; }
      .item-row b.blank { color: #999; }
      .note { font-size: 10px; color: #666; margin-top: 2px; }
      .sig { max-height: 50px; border: 1px solid #ccc; margin: 4px 0; }
      .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
      .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
      .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
      @media print { body { margin: 0; } .section { page-break-inside: auto; } .no-print { display: none !important; } }
      ${BRANDING_PRINT_CSS}
    </style></head><body>
    <div class="toolbar no-print">
      <button onclick="window.print()">🖨 Print</button>
      <button class="secondary" onclick="window.close()">Close</button>
    </div>
    ${brandingHeaderHtml()}
    <h1>Personal Service Plan</h1>
    ${opts.signed ? `<div class="signed-banner">
      🔒 Signed version — immutable audit record${opts.signed.label ? ` · ${esc(opts.signed.label)}` : ''}<br/>
      Signed off ${esc(format(new Date(opts.signed.signedOn), 'dd MMM yyyy, h:mm a'))} by ${esc(opts.signed.signedBy)}${opts.signed.signedByName ? ` · Signatory: ${esc(opts.signed.signedByName)}` : ''}
    </div>` : ''}
    <div class="sub">
      ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
      ${serviceUser.dateOfBirth ? ` · DOB ${esc(format(new Date(serviceUser.dateOfBirth), 'dd MMM yyyy'))}` : ''}
      ${serviceUser.nhsNumber ? ` · NHS ${esc(serviceUser.nhsNumber)}` : ''}
      ${opts.createdAt ? ` · Created ${esc(format(new Date(opts.createdAt), 'dd MMM yyyy'))}` : ''}
      ${opts.updatedAt ? ` · Last updated ${esc(format(new Date(opts.updatedAt), 'dd MMM yyyy, h:mm a'))}` : ''}
      · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
    </div>
    ${sectionsHtml}
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  if (autoPrint) setTimeout(() => w.print(), 300);
}
