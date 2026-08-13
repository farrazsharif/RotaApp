import { format } from 'date-fns';
import { ServiceUser } from '../types';
import { RaForm, RaSection, RaItem, RiskVal, HazardVal, keyForRaItem } from './riskAssessmentSchema';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from './printBranding';

interface PrintOpts {
  autoPrint?: boolean;   // false = readable view only. Default true.
  createdAt?: string;
  updatedAt?: string;
}

const LEVEL_LABEL: Record<string, string> = { LOW: 'Low', MED: 'Medium', HIGH: 'High' };

// Opens a printable window for a client's risk assessment. Shared by the modal's
// Print button and the readable "Open" view.
export function printRiskAssessment(serviceUser: ServiceUser, form: RaForm, values: Record<string, unknown>, opts: PrintOpts = {}) {
  const autoPrint = opts.autoPrint !== false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

  const risk = (key: string): RiskVal => (values[key] as RiskVal) || { level: '', comment: '', action: '' };
  const hazard = (key: string): HazardVal => (values[key] as HazardVal) || { level: '', whoHarmed: '', controlled: '', actions: '' };
  const str = (key: string): string => (values[key] as string) || '';
  const HML_LABEL: Record<string, string> = { H: 'High', M: 'Medium', L: 'Low' };

  // Hazard table for a section of 'risk' items.
  function riskTable(section: RaSection): string {
    const rows = section.items.map((item, i) => {
      const v = risk(keyForRaItem(section.id, i));
      const cell = (lvl: string) => `<td class="lvl">${v.level === lvl ? '✗' : ''}</td>`;
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="obs">${esc(item.label)}</td>
        ${cell('LOW')}${cell('MED')}${cell('HIGH')}
        <td>${esc(v.comment)}</td>
        <td>${esc(v.action)}</td>
      </tr>`;
    }).join('');
    return `<table class="ra">
      <thead>
        <tr><th class="num"></th><th class="obs">Observation</th><th class="lvl">Low</th><th class="lvl">Med</th><th class="lvl">High</th><th>Comments</th><th>Action needed</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Fire-safety style hazard table (Hazard · Who harmed · Controlled · Risk · Actions).
  function hazardTable(section: RaSection): string {
    const rows = section.items.map((item, i) => {
      const v = hazard(keyForRaItem(section.id, i));
      return `<tr>
        <td class="obs">${esc(item.label)}${item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ''}</td>
        <td>${esc(v.whoHarmed)}</td>
        <td>${esc(v.controlled)}</td>
        <td class="lvlw">${v.level ? esc(HML_LABEL[v.level]) : ''}</td>
        <td>${esc(v.actions)}</td>
      </tr>`;
    }).join('');
    return `<table class="ra">
      <thead>
        <tr><th class="obs">Identify the hazard</th><th>Who may be harmed</th><th>How is the risk controlled</th><th class="lvlw">Risk H/M/L</th><th>Actions required</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Non-hazard sections (details / sign-off): simple label→value fields.
  function fieldsBlock(section: RaSection): string {
    return section.items.map((item: RaItem, i) => {
      const key = keyForRaItem(section.id, i);
      if (item.type === 'signature') {
        const dataUrl = str(key);
        return `<div class="field"><div class="field-label">${esc(item.label)}</div>${dataUrl ? `<img class="sig" src="${dataUrl}" />` : '<div class="field-value">Not signed</div>'}</div>`;
      }
      const v = str(key);
      const shown = item.type === 'date' && v ? esc(format(new Date(v), 'dd MMM yyyy')) : esc(v);
      return `<div class="field"><div class="field-label">${esc(item.label)}</div><div class="field-value">${shown || '—'}</div></div>`;
    }).join('');
  }

  const sectionsHtml = form.sections.map((s) => {
    const allRisk = s.items.every((it) => (it.type || 'risk') === 'risk');
    const allHazard = s.items.every((it) => it.type === 'hazard');
    const body = allRisk ? riskTable(s) : allHazard ? hazardTable(s) : `<div class="fields-grid">${fieldsBlock(s)}</div>`;
    return `<div class="section">
      <h2>${esc(s.title)}</h2>
      ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
      ${body}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><title>${esc(form.title)} — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
    <style>
      @page { size: portrait; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 14px; }
      .section { page-break-inside: auto; margin-bottom: 16px; }
      h2 { font-size: 14px; margin: 14px 0 6px; background: #f3f3f3; padding: 5px 8px; }
      .intro { font-size: 11px; color: #555; margin: 0 0 6px; }
      table.ra { width: 100%; border-collapse: collapse; font-size: 11px; }
      table.ra th, table.ra td { border: 1px solid #999; padding: 4px 5px; text-align: left; vertical-align: top; }
      table.ra th { background: #f3f3f3; }
      table.ra .num { width: 22px; text-align: center; color: #666; }
      table.ra .obs { width: 30%; }
      table.ra .obs .hint { font-size: 9px; color: #777; font-style: italic; }
      table.ra .lvl { width: 34px; text-align: center; font-weight: bold; }
      table.ra .lvlw { width: 64px; text-align: center; font-weight: bold; }
      .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .field { margin-bottom: 6px; }
      .field-label { font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
      .field-value { font-size: 12px; white-space: pre-wrap; margin-top: 2px; }
      .sig { max-height: 60px; border: 1px solid #ccc; margin-top: 4px; }
      .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
      .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
      .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
      @media screen {
        html { background: #eef1f5; }
        body { max-width: 900px; margin: 24px auto; padding: 20px 32px 44px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
      }
      @media print { body { margin: 0; } .section { page-break-inside: auto; } .no-print { display: none !important; } }
      ${BRANDING_PRINT_CSS}
    </style></head><body>
    <div class="toolbar no-print">
      <button onclick="window.print()">🖨 Print</button>
      <button class="secondary" onclick="window.close()">Close</button>
    </div>
    ${brandingHeaderHtml()}
    <h1>${esc(form.title)}</h1>
    <div class="sub">
      ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
      ${form.formNo ? ` · Form ${esc(form.formNo)}` : ''}
      ${opts.updatedAt ? ` · Last updated ${esc(format(new Date(opts.updatedAt), 'dd MMM yyyy, h:mm a'))}` : ''}
      · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
    </div>
    ${sectionsHtml}
    <div class="fields-grid" style="margin-top:16px">
      <div><span class="field-label">Risk key</span><div class="field-value">Low / Medium / High — mark the perceived degree of risk for each observation.</div></div>
    </div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  if (autoPrint) setTimeout(() => w.print(), 300);
}
