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
  // Cancellation billing — a cancelled visit can still be chargeable, with a
  // reason captured for reporting.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelBillable" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelChargeType" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelChargePercent" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelChargeAmount" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)`);
  // Shared call-log signatures for double/triple-up calls (JSON array).
  await prisma.$executeRawUnsafe(`ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "signedBy" TEXT`);
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

  // Announcement — manager messages to the carer app (broadcast or to one carer).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Announcement" (
      "id"           TEXT PRIMARY KEY,
      "companyId"    TEXT,
      "title"        TEXT,
      "body"         TEXT NOT NULL,
      "authorId"     TEXT,
      "authorName"   TEXT NOT NULL,
      "targetUserId" TEXT,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Announcement_companyId_idx" ON "Announcement"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Announcement_targetUserId_idx" ON "Announcement"("targetUserId")`);

  // Run — a named group of calls (a round/route) worked by a default team.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Run" (
      "id"        TEXT PRIMARY KEY,
      "companyId" TEXT,
      "name"      TEXT NOT NULL,
      "color"     TEXT,
      "order"     INTEGER NOT NULL DEFAULT 0,
      "active"    BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Run_companyId_idx" ON "Run"("companyId")`);
  // Tag on each shift for the run it belongs to (nullable — most calls have none).
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "runId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Shift_companyId_runId_idx" ON "Shift"("companyId", "runId")`);
  // Implicit many-to-many join for a run's default team (Prisma "_RunCarers":
  // A = Run.id, B = User.id, alphabetical). Shape must match what Prisma expects
  // for implicit m2m: an (A,B) unique index and an index on B.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_RunCarers" (
      "A" TEXT NOT NULL,
      "B" TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_RunCarers_AB_unique" ON "_RunCarers"("A", "B")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_RunCarers_B_index" ON "_RunCarers"("B")`);

  // ServicePlanTemplate — per-company editable Personal Service Plan questions.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServicePlanTemplate" (
      "id"          TEXT PRIMARY KEY,
      "companyId"   TEXT,
      "sections"    TEXT NOT NULL DEFAULT '[]',
      "updatedById" TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ServicePlanTemplate_companyId_key" ON "ServicePlanTemplate"("companyId")`);

  // ServicePlanVersion — immutable signed snapshots (CQC audit trail).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServicePlanVersion" (
      "id"            TEXT PRIMARY KEY,
      "companyId"     TEXT,
      "serviceUserId" TEXT NOT NULL,
      "sections"      TEXT NOT NULL,
      "data"          TEXT NOT NULL,
      "label"         TEXT,
      "signedByName"  TEXT,
      "createdById"   TEXT,
      "createdByName" TEXT NOT NULL,
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServicePlanVersion_companyId_idx" ON "ServicePlanVersion"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServicePlanVersion_serviceUserId_idx" ON "ServicePlanVersion"("serviceUserId")`);
}
