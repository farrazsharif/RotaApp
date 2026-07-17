import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Wipes call logs, medications, service users (and everything that depends on
// them — care plans, medication administrations, shifts, clock records) so an
// admin can start testing with a clean slate. Staff/user accounts are left
// untouched. Deletion order respects FK constraints since not every relation
// cascades automatically.
export async function resetTestData(req: AuthRequest, res: Response) {
  const result = await prisma.$transaction(async (tx) => {
    const clockRecords = await tx.clockRecord.deleteMany({});
    const callLogs = await tx.callLog.deleteMany({});
    const medAdministrations = await tx.medAdministration.deleteMany({});
    const medications = await tx.medication.deleteMany({});
    const carePlans = await tx.carePlan.deleteMany({});
    const servicePlans = await tx.personalServicePlan.deleteMany({});
    const shifts = await tx.shift.deleteMany({});
    const serviceUsers = await tx.serviceUser.deleteMany({});
    return {
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

// Temporary read-only diagnostic: reports the Shift table's indexes and the
// per-company shift volume, so we can confirm (from outside the affected
// tenant) whether the performance indexes were actually created and how large
// the biggest company's rota is. Raw SQL bypasses the tenant scope on purpose.
export async function dbHealth(_req: AuthRequest, res: Response) {
  const indexes = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Shift' ORDER BY indexname`,
  );
  const totalRow = await prisma.$queryRawUnsafe<{ total: number }[]>(`SELECT count(*)::int AS total FROM "Shift"`);
  const byCompany = await prisma.$queryRawUnsafe<{ companyId: string | null; shifts: number; future: number }[]>(
    `SELECT "companyId", count(*)::int AS shifts, count(*) FILTER (WHERE date >= now())::int AS future
       FROM "Shift" GROUP BY "companyId" ORDER BY count(*) DESC LIMIT 10`,
  );
  res.json({ indexes, totalShifts: totalRow[0]?.total ?? 0, byCompany });
}
