import { format } from 'date-fns';
import { ServiceUser } from '../types';
import { brandingHeaderHtml, BRANDING_PRINT_CSS } from './printBranding';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'tea', label: 'Tea' },
  { key: 'bed', label: 'Bed' },
] as const;

type SlotKey = typeof SLOTS[number]['key'];
type DaySchedule = Partial<Record<SlotKey, string>>;
export type CarePlanSchedule = Partial<Record<typeof DAYS[number], DaySchedule>>;

export interface CarePlanPrintData {
  schedule: CarePlanSchedule;
  tasksMorning: string;
  tasksLunch: string;
  tasksTea: string;
  tasksBed: string;
  numberOfCarers: string;
  carePackageInfo: string;
  otherNotes: string;
  reviewDate: string; // yyyy-MM-dd or ISO
}

interface PrintOpts {
  autoPrint?: boolean; // false = readable view only (no auto print dialog). Default true.
  createdAt?: string;
  updatedAt?: string;
}

const TASK_FIELDS: { key: keyof CarePlanPrintData; label: string }[] = [
  { key: 'tasksMorning', label: 'Morning' },
  { key: 'tasksLunch', label: 'Lunch' },
  { key: 'tasksTea', label: 'Tea' },
  { key: 'tasksBed', label: 'Bed' },
];

// Opens a printable window for a client's Care Plan. Shared by the care-plan
// modal, "Open" (readable view) and "Print" on the Care Plans list.
export function printCarePlan(serviceUser: ServiceUser, data: CarePlanPrintData, opts: PrintOpts = {}) {
  const autoPrint = opts.autoPrint !== false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

  const scheduleRows = DAYS.map((day) => `
    <tr>
      <td class="day-col">${esc(day)}</td>
      ${SLOTS.map((s) => `<td>${esc(data.schedule[day]?.[s.key] || '')}</td>`).join('')}
    </tr>
  `).join('');

  const taskRows = TASK_FIELDS
    .map(({ key, label }) => ({ label, value: (data[key] as string) || '' }))
    .filter((t) => t.value)
    .map((t) => `<div class="field"><div class="field-label">${esc(t.label)} — tasks</div><div class="field-value">${esc(t.value)}</div></div>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><title>Care Plan — ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</title>
    <style>
      @page { size: portrait; margin: 15mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
      th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
      th { background: #f3f3f3; }
      .day-col { font-weight: bold; white-space: nowrap; }
      .field { margin-bottom: 10px; }
      .field-label { font-size: 10px; font-weight: bold; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
      .field-value { font-size: 12px; white-space: pre-wrap; margin-top: 2px; }
      .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .sign-row { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; }
      .sign-row .line { border-top: 1px solid #333; width: 45%; padding-top: 4px; }
      .toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 8px 0 10px; margin-bottom: 12px; display: flex; gap: 8px; }
      .toolbar button { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #2563eb; background: #2563eb; color: #fff; cursor: pointer; }
      .toolbar button.secondary { background: #fff; color: #374151; border-color: #d1d5db; }
      @media print { body { margin: 0; } .no-print { display: none !important; } }
      ${BRANDING_PRINT_CSS}
    </style></head><body>
    <div class="toolbar no-print">
      <button onclick="window.print()">🖨 Print</button>
      <button class="secondary" onclick="window.close()">Close</button>
    </div>
    ${brandingHeaderHtml()}
    <h1>Care Plan</h1>
    <div class="sub">
      ${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}
      ${opts.createdAt ? ` · Created ${esc(format(new Date(opts.createdAt), 'dd MMM yyyy'))}` : ''}
      ${opts.updatedAt ? ` · Last updated ${esc(format(new Date(opts.updatedAt), 'dd MMM yyyy, h:mm a'))}` : ''}
      · Printed ${esc(format(new Date(), 'dd MMM yyyy, h:mm a'))}
    </div>

    <h2>Service User Basic Information</h2>
    <div class="fields-grid">
      <div class="field"><div class="field-label">Name</div><div class="field-value">${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)}</div></div>
      <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${serviceUser.dateOfBirth ? esc(format(new Date(serviceUser.dateOfBirth), 'dd MMM yyyy')) : '—'}</div></div>
      <div class="field"><div class="field-label">NHS Number</div><div class="field-value">${esc(serviceUser.nhsNumber || '—')}</div></div>
      <div class="field"><div class="field-label">Phone</div><div class="field-value">${esc(serviceUser.phone || '—')}</div></div>
      <div class="field"><div class="field-label">Address</div><div class="field-value">${esc([serviceUser.address, serviceUser.postcode].filter(Boolean).join(', ') || '—')}</div></div>
    </div>

    <h2>Profile</h2>
    <div class="field"><div class="field-value">${esc(data.carePackageInfo || '—')}</div></div>

    <h2>Weekly Visit Profile</h2>
    <table>
      <thead><tr><th>Day</th>${SLOTS.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${scheduleRows}</tbody>
    </table>

    <h2>Care Package Details</h2>
    <div class="fields-grid">
      <div class="field"><div class="field-label">Number of Carers</div><div class="field-value">${esc(data.numberOfCarers || '—')}</div></div>
      <div class="field"><div class="field-label">Review Date</div><div class="field-value">${data.reviewDate ? esc(format(new Date(data.reviewDate), 'dd MMM yyyy')) : '—'}</div></div>
    </div>

    <h2>Tasks Required (Any Preferences)</h2>
    ${taskRows || '<p style="font-size:12px;color:#777;">None recorded.</p>'}

    <h2>Other</h2>
    <div class="field"><div class="field-label">Other Notes</div><div class="field-value">${esc(data.otherNotes || '—')}</div></div>

    <div class="sign-row">
      <div class="line">Carer signature / date</div>
      <div class="line">Service User / Representative signature / date</div>
    </div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  if (autoPrint) setTimeout(() => w.print(), 300);
}
