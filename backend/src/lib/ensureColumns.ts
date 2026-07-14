// Safety net for environments where the deploy doesn't run `prisma db push`:
// make sure the newer columns exist. Uses ADD COLUMN IF NOT EXISTS so it's
// idempotent and a no-op once the columns are present.
export async function ensureServiceUserColumns(prisma: any): Promise<void> {
  const cols = ['preferredName', 'gender', 'ethnicOrigin', 'keySafe', 'medsSafeCode', 'packageId', 'grabSheet', 'title'];
  for (const col of cols) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  }
  // JSON array column — non-null with a default so existing rows stay valid.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "supportCategories" TEXT NOT NULL DEFAULT '[]'`);
  // Flag marking an open-ended recurring series for the permanent top-up job.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "seriesPermanent" BOOLEAN NOT NULL DEFAULT false`);
  // ECM: manager's reason/explanation for a short or missed visit.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "ecmNote" TEXT`);
  // Date the person started receiving care (nullable).
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "serviceStartDate" TIMESTAMP(3)`);
  // Site display order on the schedule (lower = first). "order" is a reserved
  // word so it must stay double-quoted.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0`);
  // Supervision.nextReviewDate — the table is created by db push; guard the
  // column in case the table already existed from an earlier deploy.
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Supervision" ADD COLUMN IF NOT EXISTS "nextReviewDate" TIMESTAMP(3)`);
  } catch { /* table not created yet on this deploy; db push adds it with the column */ }

  // ShiftHandover — carer-to-carer cover requests. This deploy doesn't run
  // `prisma db push`, so create the table (and its indexes) directly. No DB-level
  // foreign keys: Prisma resolves relations via the scalar columns, and skipping
  // the constraints keeps this create order-independent and idempotent.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShiftHandover" (
      "id"          TEXT PRIMARY KEY,
      "companyId"   TEXT,
      "shiftId"     TEXT NOT NULL,
      "fromUserId"  TEXT NOT NULL,
      "toUserId"    TEXT NOT NULL,
      "reason"      TEXT,
      "status"      TEXT NOT NULL DEFAULT 'PENDING',
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "respondedAt" TIMESTAMP(3)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShiftHandover_companyId_idx" ON "ShiftHandover"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShiftHandover_toUserId_status_idx" ON "ShiftHandover"("toUserId", "status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShiftHandover_shiftId_idx" ON "ShiftHandover"("shiftId")`);
}
