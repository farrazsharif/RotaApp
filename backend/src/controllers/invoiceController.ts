import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const VAT_RATE = 0.20;
const money = (n: number) => Math.round(n * 100) / 100;

// Visit length in hours from "HH:MM" start/end (adds a day if it crosses midnight).
function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

const lineInclude = {
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function listInvoices(_req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    include: {
      funder: { select: { id: true, name: true, type: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
}

export async function getInvoice(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { funder: true, lines: { include: lineInclude, orderBy: { date: 'asc' } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
}

// Build a DRAFT invoice from every unbilled scheduled visit in the period for
// service users funded by the given funder. Marks those visits billed.
export async function generateInvoice(req: AuthRequest, res: Response) {
  const { funderId, periodStart, periodEnd, serviceUserId } = req.body;
  if (!funderId || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'funderId, periodStart and periodEnd are required' });
  }

  const funder = await prisma.funder.findUnique({ where: { id: funderId } });
  if (!funder) return res.status(400).json({ error: 'Funder not found' });

  // An optional serviceUserId narrows the invoice to a single service user.
  const arrangements = await prisma.fundingArrangement.findMany({
    where: { funderId, ...(serviceUserId ? { serviceUserId } : {}) },
    select: { serviceUserId: true, rate: true },
  });
  if (arrangements.length === 0) {
    return res.status(400).json({
      error: serviceUserId ? 'That service user is not funded by this funder.' : 'No service users are funded by this funder yet.',
    });
  }
  const rateBySu = new Map(arrangements.map((a) => [a.serviceUserId, a.rate]));
  const suIds = arrangements.map((a) => a.serviceUserId);

  const start = new Date(`${periodStart}T00:00:00`);
  const end = new Date(`${periodEnd}T23:59:59`);

  const shifts = await prisma.shift.findMany({
    where: {
      serviceUserId: { in: suIds },
      date: { gte: start, lte: end },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
      invoiceLine: null,
    },
    include: { serviceUser: { select: { firstName: true, lastName: true } } },
    orderBy: [{ serviceUserId: 'asc' }, { date: 'asc' }],
  });
  if (shifts.length === 0) {
    return res.status(400).json({ error: 'No unbilled scheduled visits in that period for this funder.' });
  }

  const lines = shifts.map((s) => {
    const hours = durationHours(s.startTime, s.endTime);
    const quantity = money(hours * (s.cover || 1));
    const unitRate = rateBySu.get(s.serviceUserId!) ?? 0;
    const amount = money(quantity * unitRate);
    const name = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Service user';
    const dateStr = s.date.toISOString().slice(0, 10);
    const cov = (s.cover || 1) > 1 ? ` (×${s.cover} carers)` : '';
    return {
      serviceUserId: s.serviceUserId,
      sourceShiftId: s.id,
      date: s.date,
      description: `${dateStr} · ${s.visitName || 'Visit'} · ${name}${cov}`,
      quantity,
      unitRate,
      amount,
    };
  });

  const subtotal = money(lines.reduce((sum, l) => sum + l.amount, 0));
  const vat = funder.vatExempt ? 0 : money(subtotal * VAT_RATE);
  const total = money(subtotal + vat);

  const invoice = await prisma.invoice.create({
    data: {
      funderId,
      periodStart: start,
      periodEnd: end,
      status: 'DRAFT',
      subtotal,
      vat,
      total,
      poNumber: funder.poReference || null,
      lines: { create: lines },
    },
    include: { funder: true, lines: { include: lineInclude, orderBy: { date: 'asc' } } },
  });
  res.status(201).json(invoice);
}

export async function updateInvoice(req: AuthRequest, res: Response) {
  const { status, notes, poNumber } = req.body;
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { funder: true } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const data: Record<string, unknown> = {};
  if (notes !== undefined) data.notes = notes || null;
  if (poNumber !== undefined) data.poNumber = poNumber || null;

  if (status !== undefined) {
    if (!['DRAFT', 'SENT', 'PAID', 'VOID'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    data.status = status;
    // First time it's marked Sent: assign a number + issue/due dates.
    if (status === 'SENT' && !invoice.number) {
      const n = await prisma.invoice.count({ where: { number: { not: null } } });
      data.number = `INV-${String(n + 1).padStart(4, '0')}`;
      const issue = new Date();
      data.issueDate = issue;
      data.dueDate = new Date(issue.getTime() + (invoice.funder.paymentTermsDays || 30) * 86400000);
    }
    // Voiding releases its billed visits so they can be re-invoiced later.
    if (status === 'VOID') {
      await prisma.invoiceLine.updateMany({ where: { invoiceId: invoice.id }, data: { sourceShiftId: null } });
    }
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data,
    include: { funder: true, lines: { include: lineInclude, orderBy: { date: 'asc' } } },
  });
  res.json(updated);
}

export async function deleteInvoice(req: AuthRequest, res: Response) {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status !== 'DRAFT' && invoice.status !== 'VOID') {
    return res.status(409).json({ error: 'Only draft or void invoices can be deleted. Void a sent invoice first.' });
  }
  // Cascade removes the lines, which frees their source visits for re-billing.
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ message: 'Invoice deleted' });
}
