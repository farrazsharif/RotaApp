import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const money = (n: number) => Math.round(n * 100) / 100;

// Record a payment against an invoice and update its status. Payments can only
// be taken on invoices that have been sent (or already partly paid).
export async function createPayment(req: AuthRequest, res: Response) {
  const { invoiceId, amount, date, method, reference, notes } = req.body;
  if (!invoiceId || amount == null) return res.status(400).json({ error: 'invoiceId and amount are required' });

  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'DRAFT' || invoice.status === 'VOID') {
    return res.status(409).json({ error: 'Finalise & send the invoice before recording payments.' });
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount: money(amt),
      date: date ? new Date(date) : new Date(),
      method: method || null,
      reference: reference || null,
      notes: notes || null,
    },
  });

  // Recompute total paid; mark PAID once covered, otherwise keep it SENT.
  const paid = money(invoice.payments.reduce((s, p) => s + p.amount, 0) + payment.amount);
  const status = paid >= invoice.total ? 'PAID' : 'SENT';
  if (status !== invoice.status) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  res.status(201).json(payment);
}

export async function deletePayment(req: AuthRequest, res: Response) {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  await prisma.payment.delete({ where: { id: payment.id } });

  // Re-evaluate status after removing the payment.
  const invoice = await prisma.invoice.findUnique({ where: { id: payment.invoiceId }, include: { payments: true } });
  if (invoice && invoice.status !== 'VOID' && invoice.status !== 'DRAFT') {
    const paid = money(invoice.payments.reduce((s, p) => s + p.amount, 0));
    const status = paid >= invoice.total ? 'PAID' : 'SENT';
    if (status !== invoice.status) await prisma.invoice.update({ where: { id: invoice.id }, data: { status } });
  }

  res.json({ message: 'Payment removed' });
}

// Aged-debt report: unpaid balances on sent invoices, bucketed by how overdue
// they are relative to their due date.
export async function getAgedDebt(_req: AuthRequest, res: Response) {
  const invoices = await prisma.invoice.findMany({
    where: { status: 'SENT' },
    include: { funder: { select: { id: true, name: true } }, payments: { select: { amount: true } } },
  });

  const now = Date.now();
  const buckets = { current: 0, days30: 0, days60: 0, days90: 0 };
  const rows = [] as any[];

  for (const inv of invoices) {
    const paid = money(inv.payments.reduce((s, p) => s + p.amount, 0));
    const outstanding = money(inv.total - paid);
    if (outstanding <= 0) continue;

    const due = inv.dueDate ? new Date(inv.dueDate).getTime() : now;
    const daysOverdue = Math.floor((now - due) / 86400000);

    let bucket: keyof typeof buckets;
    if (daysOverdue <= 0) bucket = 'current';
    else if (daysOverdue <= 30) bucket = 'days30';
    else if (daysOverdue <= 60) bucket = 'days60';
    else bucket = 'days90';
    buckets[bucket] = money(buckets[bucket] + outstanding);

    rows.push({
      id: inv.id,
      number: inv.number,
      funder: inv.funder?.name,
      dueDate: inv.dueDate,
      total: inv.total,
      paid,
      outstanding,
      daysOverdue: Math.max(0, daysOverdue),
    });
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const totalOutstanding = money(rows.reduce((s, r) => s + r.outstanding, 0));
  res.json({ buckets, totalOutstanding, rows });
}
