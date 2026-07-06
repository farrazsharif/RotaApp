import { format } from 'date-fns';
import { Invoice, OrgSettings } from '../types';

const fmtDate = (d?: string | null) => (d ? format(new Date(d), 'dd MMM yyyy') : '');
const gbp = (n: number) => `£${n.toFixed(2)}`;

function invoiceFilename(inv: Invoice, ext: string) {
  const base = inv.number || `draft-${inv.id.slice(-6)}`;
  return `invoice-${base}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadInvoiceCsv(inv: Invoice) {
  const rows: string[][] = [['Date', 'Description', 'Hours', 'Rate', 'Amount']];
  (inv.lines || []).forEach((l) => {
    rows.push([fmtDate(l.date), l.description, l.quantity.toFixed(2), l.unitRate.toFixed(2), l.amount.toFixed(2)]);
  });
  rows.push([], ['', '', '', 'Subtotal', inv.subtotal.toFixed(2)], ['', '', '', 'VAT', inv.vat.toFixed(2)], ['', '', '', 'Total', inv.total.toFixed(2)]);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), invoiceFilename(inv, 'csv'));
}

export async function downloadInvoicePdf(inv: Invoice, org?: OrgSettings | null) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  const M = 14;
  const right = 200 - M;

  // Letterhead (left)
  let y = 20;
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(0);
  doc.text(org?.companyName || 'Caremid', M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  y += 6;
  const addLines = (text?: string | null) => {
    if (!text) return;
    const lines = text.split(/\r?\n/);
    doc.text(lines, M, y);
    y += 4 * lines.length;
  };
  addLines(org?.address);
  addLines(org?.phone);
  addLines(org?.email);

  // Invoice title (right)
  doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(22);
  doc.text('INVOICE', right, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(inv.number || 'DRAFT', right, 29, { align: 'right' });

  // Bill To (left) + meta (right)
  let by = Math.max(y, 40) + 6;
  doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(10).text('Bill To', M, by);
  doc.setFont('helvetica', 'normal').setTextColor(60);
  doc.text(inv.funder?.name || 'Funder', M, by + 5);
  if (inv.funder?.billingAddress) doc.text(inv.funder.billingAddress.split(/\r?\n/), M, by + 10);

  const meta: [string, string][] = [
    ['Period', `${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}`],
    ['Issue date', fmtDate(inv.issueDate) || '—'],
    ['Due date', fmtDate(inv.dueDate) || '—'],
    ['PO / Ref', inv.poNumber || '—'],
  ];
  let my = by;
  doc.setTextColor(0);
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold').text(k, 130, my);
    doc.setFont('helvetica', 'normal').text(v, right, my, { align: 'right' });
    my += 5;
  });

  autoTable(doc, {
    startY: Math.max(my, by + 22) + 4,
    head: [['Date', 'Description', 'Hours', 'Rate (£)', 'Amount (£)']],
    body: (inv.lines || []).map((l) => [fmtDate(l.date), l.description, l.quantity.toFixed(2), l.unitRate.toFixed(2), l.amount.toFixed(2)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: M, right: M },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10).setTextColor(0);
  doc.text('Subtotal', 150, afterY); doc.text(gbp(inv.subtotal), right, afterY, { align: 'right' });
  doc.text('VAT', 150, afterY + 6); doc.text(gbp(inv.vat), right, afterY + 6, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text('Total', 150, afterY + 13); doc.text(gbp(inv.total), right, afterY + 13, { align: 'right' });

  doc.save(invoiceFilename(inv, 'pdf'));
}
