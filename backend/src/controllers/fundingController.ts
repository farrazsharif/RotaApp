import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';

// Funding arrangements link a service user to a funder + charge rate. Site
// scoping is enforced by the route middleware (scopeServiceUserRef / by-id);
// the list-all branch below applies its own site scope.
export async function listFunding(req: AuthRequest, res: Response) {
  const serviceUserId = req.query.serviceUserId as string | undefined;
  // With a serviceUserId, list that user's arrangement(s) (guarded by middleware).
  // Without one, list all arrangements the caller can see (Finances overview).
  const where = serviceUserId ? { serviceUserId } : relatedServiceUserScopeWhere(req.user);
  const arrangements = await prisma.fundingArrangement.findMany({
    where,
    include: {
      funder: true,
      serviceUser: { select: { id: true, firstName: true, lastName: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(arrangements);
}

export async function createFunding(req: AuthRequest, res: Response) {
  const { serviceUserId, funderId, rate, weekendRate, bankHolidayRate, startDate, endDate, poNumber, contractRef } = req.body;
  if (!serviceUserId || !funderId) return res.status(400).json({ error: 'serviceUserId and funderId are required' });

  const funder = await prisma.funder.findUnique({ where: { id: funderId } });
  if (!funder) return res.status(400).json({ error: 'Funder not found' });

  const arrangement = await prisma.fundingArrangement.create({
    data: {
      serviceUserId,
      funderId,
      rate: Number(rate) || 0,
      // Blank enhanced rates fall back to the base rate at billing time.
      weekendRate: weekendRate === '' || weekendRate == null ? null : Number(weekendRate),
      bankHolidayRate: bankHolidayRate === '' || bankHolidayRate == null ? null : Number(bankHolidayRate),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      poNumber: poNumber || null,
      contractRef: contractRef || null,
    },
    include: { funder: true },
  });
  res.status(201).json(arrangement);
}

export async function updateFunding(req: AuthRequest, res: Response) {
  const { funderId, rate, weekendRate, bankHolidayRate, startDate, endDate, poNumber, contractRef } = req.body;
  const data: Record<string, unknown> = {};
  if (funderId !== undefined) {
    const funder = await prisma.funder.findUnique({ where: { id: funderId } });
    if (!funder) return res.status(400).json({ error: 'Funder not found' });
    data.funderId = funderId;
  }
  if (rate !== undefined) data.rate = Number(rate) || 0;
  if (weekendRate !== undefined) data.weekendRate = weekendRate === '' || weekendRate == null ? null : Number(weekendRate);
  if (bankHolidayRate !== undefined) data.bankHolidayRate = bankHolidayRate === '' || bankHolidayRate == null ? null : Number(bankHolidayRate);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (poNumber !== undefined) data.poNumber = poNumber || null;
  if (contractRef !== undefined) data.contractRef = contractRef || null;

  const arrangement = await prisma.fundingArrangement.update({
    where: { id: req.params.id },
    data,
    include: { funder: true },
  });
  res.json(arrangement);
}

export async function deleteFunding(req: AuthRequest, res: Response) {
  await prisma.fundingArrangement.delete({ where: { id: req.params.id } });
  res.json({ message: 'Funding arrangement removed' });
}
