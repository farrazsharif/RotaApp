import { Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { serviceUserInScope } from '../lib/scope';
import { putObject, deleteObject, getDownloadUrl, storageConfigured } from '../lib/storage';
import { Role } from '../constants';

// GET /financial-transactions?serviceUserId=... — the client's money ledger with
// a running balance (seeded by financeOpeningBalance). Ordered oldest-first so
// the balance reads down the page like a bank statement.
export async function listTransactions(req: AuthRequest, res: Response) {
  const serviceUserId = String(req.query.serviceUserId || '');
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId is required' });
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  const su = await prisma.serviceUser.findUnique({
    where: { id: serviceUserId },
    select: { handlesMoney: true, financeOpeningBalance: true, firstName: true, lastName: true },
  });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  const txns = await prisma.financialTransaction.findMany({ where: { serviceUserId }, orderBy: { date: 'asc' } });

  // Resolve each carer's current name (only their id is stored on the row).
  const carerIds = [...new Set(txns.map((t) => t.userId).filter((x): x is string => !!x))];
  const carers = carerIds.length
    ? await prisma.user.findMany({ where: { id: { in: carerIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameById = new Map(carers.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));

  const opening = su.financeOpeningBalance || 0;
  let balance = opening;
  const transactions = txns.map((t) => {
    balance = balance + (t.amountIn || 0) - (t.amountOut || 0);
    // Never ship the raw R2 key; expose only whether a receipt exists.
    const { receiptKey, ...rest } = t;
    return { ...rest, carerName: t.userId ? (nameById.get(t.userId) ?? null) : null, balance, hasReceipt: !!receiptKey };
  });

  res.json({
    serviceUserId,
    clientName: `${su.firstName} ${su.lastName}`.trim(),
    handlesMoney: su.handlesMoney,
    openingBalance: opening,
    currentBalance: balance,
    transactions,
  });
}

// POST /financial-transactions — record a spend/receipt. Carers may only record
// against a visit they're on; managers may add without a visit (office backfill).
export async function createTransaction(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, description, amountIn, amountOut, clientSignature, unableToSign, unableReason, date } = req.body;
  if (!serviceUserId || !description || !String(description).trim()) {
    return res.status(400).json({ error: 'serviceUserId and description are required' });
  }
  if (!(await serviceUserInScope(req.user, serviceUserId))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { handlesMoney: true } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });
  if (!su.handlesMoney) return res.status(403).json({ error: 'Financial transactions are not enabled for this client.' });

  const isManager = req.user!.role !== Role.EMPLOYEE;
  if (!isManager) {
    if (!shiftId) return res.status(403).json({ error: 'A visit is required to record a transaction.' });
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { userId: true, coverCarers: { select: { id: true } } },
    });
    const onCall = !!shift && (shift.userId === req.user!.id || shift.coverCarers.some((c) => c.id === req.user!.id));
    if (!onCall) return res.status(403).json({ error: 'You are not assigned to this visit.' });
  }

  const inAmt = Math.max(0, Number(amountIn) || 0);
  const outAmt = Math.max(0, Number(amountOut) || 0);
  if (inAmt === 0 && outAmt === 0) {
    return res.status(400).json({ error: 'Enter an amount spent or received.' });
  }

  const unable = !!unableToSign;
  const txn = await prisma.financialTransaction.create({
    data: {
      serviceUserId,
      shiftId: shiftId || null,
      userId: req.user!.id,
      date: date ? new Date(String(date)) : new Date(),
      description: String(description).trim(),
      amountIn: inAmt,
      amountOut: outAmt,
      clientSignature: unable ? null : (clientSignature ? String(clientSignature) : null),
      unableToSign: unable,
      unableReason: unable ? (unableReason ? String(unableReason).trim() : null) : null,
    },
  });

  res.status(201).json({ id: txn.id });
}

// POST /financial-transactions/:id/receipt — attach a receipt photo (R2).
export async function uploadReceipt(req: AuthRequest, res: Response) {
  const txn = await prisma.financialTransaction.findUnique({ where: { id: req.params.id } });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  if (!(await serviceUserInScope(req.user, txn.serviceUserId))) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (!storageConfigured()) {
    return res.status(503).json({ error: 'Receipt storage is not set up yet. Add the Cloudflare R2 keys to enable uploads.', code: 'STORAGE_NOT_CONFIGURED' });
  }

  const safeName = String(file.originalname || 'receipt').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'receipt';
  const storageKey = `${req.user!.companyId}/finance/${txn.serviceUserId}/${randomUUID()}-${safeName}`;
  await putObject(storageKey, file.buffer, file.mimetype);
  // Replace any previous receipt on this transaction.
  if (txn.receiptKey) { try { await deleteObject(txn.receiptKey); } catch { /* leave the orphan; row updates regardless */ } }
  await prisma.financialTransaction.update({ where: { id: txn.id }, data: { receiptKey: storageKey, receiptName: safeName } });
  res.json({ ok: true });
}

// GET /financial-transactions/:id/receipt — short-lived link to the receipt.
export async function getReceipt(req: AuthRequest, res: Response) {
  const txn = await prisma.financialTransaction.findUnique({ where: { id: req.params.id } });
  if (!txn || !txn.receiptKey) return res.status(404).json({ error: 'Receipt not found' });
  if (!(await serviceUserInScope(req.user, txn.serviceUserId))) {
    return res.status(404).json({ error: 'Receipt not found' });
  }
  const url = await getDownloadUrl(txn.receiptKey, txn.receiptName || 'receipt', req.query.inline === '1');
  res.json({ url });
}

// DELETE /financial-transactions/:id — office correction (manage_service_users).
export async function deleteTransaction(req: AuthRequest, res: Response) {
  const txn = await prisma.financialTransaction.findUnique({ where: { id: req.params.id } });
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  if (!(await serviceUserInScope(req.user, txn.serviceUserId))) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  if (txn.receiptKey) { try { await deleteObject(txn.receiptKey); } catch { /* best effort */ } }
  await prisma.financialTransaction.delete({ where: { id: txn.id } });
  res.json({ ok: true });
}
