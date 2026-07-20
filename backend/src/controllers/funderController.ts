import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const FUNDER_TYPES = ['COUNCIL', 'PRIVATE', 'NHS_CHC'];

// Funders (councils / private payers / NHS) are org-wide entities, reused across
// service users — no site-scoping.
export async function listFunders(_req: AuthRequest, res: Response) {
  const funders = await prisma.funder.findMany({
    include: { _count: { select: { fundingArrangements: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(funders);
}

export async function createFunder(req: AuthRequest, res: Response) {
  const { name, type, contactName, email, phone, billingAddress, poReference, paymentTermsDays, vatExempt, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Funder name is required' });

  const funder = await prisma.funder.create({
    data: {
      name: String(name).trim(),
      type: FUNDER_TYPES.includes(type) ? type : 'PRIVATE',
      contactName: contactName || null,
      email: email || null,
      phone: phone || null,
      billingAddress: billingAddress || null,
      poReference: poReference || null,
      paymentTermsDays: Number.isFinite(Number(paymentTermsDays)) ? Number(paymentTermsDays) : 30,
      vatExempt: vatExempt !== undefined ? !!vatExempt : true,
      notes: notes || null,
    },
  });
  await logAudit(req, 'FUNDER_ADDED', funder.name);
  res.status(201).json(funder);
}

export async function updateFunder(req: AuthRequest, res: Response) {
  const { name, type, contactName, email, phone, billingAddress, poReference, paymentTermsDays, vatExempt, notes } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Funder name is required' });
    data.name = String(name).trim();
  }
  if (type !== undefined) data.type = FUNDER_TYPES.includes(type) ? type : 'PRIVATE';
  if (contactName !== undefined) data.contactName = contactName || null;
  if (email !== undefined) data.email = email || null;
  if (phone !== undefined) data.phone = phone || null;
  if (billingAddress !== undefined) data.billingAddress = billingAddress || null;
  if (poReference !== undefined) data.poReference = poReference || null;
  if (paymentTermsDays !== undefined) data.paymentTermsDays = Number.isFinite(Number(paymentTermsDays)) ? Number(paymentTermsDays) : 30;
  if (vatExempt !== undefined) data.vatExempt = !!vatExempt;
  if (notes !== undefined) data.notes = notes || null;

  const funder = await prisma.funder.update({ where: { id: req.params.id }, data });
  await logAudit(req, 'FUNDER_UPDATED', funder.name);
  res.json(funder);
}

export async function deleteFunder(req: AuthRequest, res: Response) {
  const count = await prisma.fundingArrangement.count({ where: { funderId: req.params.id } });
  if (count > 0) {
    return res.status(409).json({
      error: `This funder is still assigned to ${count} service user${count > 1 ? 's' : ''}. Remove those funding arrangements first.`,
    });
  }
  const existing = await prisma.funder.findUnique({ where: { id: req.params.id }, select: { name: true } });
  await prisma.funder.delete({ where: { id: req.params.id } });
  if (existing) await logAudit(req, 'FUNDER_DELETED', existing.name);
  res.json({ message: 'Funder deleted' });
}
