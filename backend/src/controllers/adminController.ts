import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Wipes call logs, medications, service users (and everything that depends on
// them — care plans, medication administrations, shifts, clock records, shift
// trades) so an admin can start testing with a clean slate. Staff/user
// accounts are left untouched. Deletion order respects FK constraints since
// not every relation cascades automatically.
export async function resetTestData(req: AuthRequest, res: Response) {
  const result = await prisma.$transaction(async (tx) => {
    const shiftTrades = await tx.shiftTrade.deleteMany({});
    const clockRecords = await tx.clockRecord.deleteMany({});
    const callLogs = await tx.callLog.deleteMany({});
    const medAdministrations = await tx.medAdministration.deleteMany({});
    const medications = await tx.medication.deleteMany({});
    const carePlans = await tx.carePlan.deleteMany({});
    const servicePlans = await tx.personalServicePlan.deleteMany({});
    const shifts = await tx.shift.deleteMany({});
    const serviceUsers = await tx.serviceUser.deleteMany({});
    return {
      shiftTrades: shiftTrades.count,
      clockRecords: clockRecords.count,
      callLogs: callLogs.count,
      medAdministrations: medAdministrations.count,
      medications: medications.count,
      carePlans: carePlans.count,
      servicePlans: servicePlans.count,
      shifts: shifts.count,
      serviceUsers: serviceUsers.count,
    };
  });

  res.json({ message: 'Test data cleared. Staff/user accounts were not affected.', deleted: result });
}
