// Safety net for environments where the deploy doesn't run `prisma db push`:
// make sure the newer columns exist. Uses ADD COLUMN IF NOT EXISTS so it's
// idempotent and a no-op once the columns are present.
export async function ensureServiceUserColumns(prisma: any): Promise<void> {
  const cols = ['preferredName', 'gender', 'ethnicOrigin', 'keySafe', 'medsSafeCode', 'packageId', 'grabSheet', 'title', 'emergencyContactEmail', 'nextOfKinEmail'];
  for (const col of cols) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  }
  // JSON array column — non-null with a default so existing rows stay valid.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "supportCategories" TEXT NOT NULL DEFAULT '[]'`);
  // Flag marking an open-ended recurring series for the permanent top-up job.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "seriesPermanent" BOOLEAN NOT NULL DEFAULT false`);
  // Does the carer administer medication on this visit? Off for personal-care-
  // only visits so their doses don't show to (and block) that carer.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "givesMedication" BOOLEAN NOT NULL DEFAULT true`);
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
  // Ticked checklist tasks the carer completed on the visit (JSON array); the
  // visit note is auto-written from these.
  await prisma.$executeRawUnsafe(`ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "tasks" TEXT NOT NULL DEFAULT '[]'`);
  // Company's configurable carer-app visit checklist (JSON array of task defs).
  await prisma.$executeRawUnsafe(`ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "callLogTasks" TEXT NOT NULL DEFAULT '[]'`);
  // Date the person started receiving care (nullable).
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "serviceStartDate" TIMESTAMP(3)`);
  // Council-agreed hours of care per week (care package) — for the required-vs-scheduled report.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "contractedWeeklyHours" DOUBLE PRECISION`);
  // Blister pack (MDS/dosette) support on medications: a flag and the free-text
  // list of what's inside the pack.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "isBlisterPack" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "packContents" TEXT`);
  // Which weekdays a med is due (JSON array of 0-6, 0=Sun). Empty = every day.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "daysOfWeek" TEXT NOT NULL DEFAULT '[]'`);
  // Site display order on the schedule (lower = first). "order" is a reserved
  // word so it must stay double-quoted.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0`);
  // Supervision.nextReviewDate — the table is created by db push; guard the
  // column in case the table already existed from an earlier deploy.
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Supervision" ADD COLUMN IF NOT EXISTS "nextReviewDate" TIMESTAMP(3)`);
    // "paper" historic supervisions: a source marker + an optional note.
    await prisma.$executeRawUnsafe(`ALTER TABLE "Supervision" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'form'`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Supervision" ADD COLUMN IF NOT EXISTS "note" TEXT`);
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
  await prisma.$executeRawUnsafe(`ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "targetUserIds" TEXT NOT NULL DEFAULT '[]'`);
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

  // RiskAssessment — a client's completed risk assessment(s), one per type.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RiskAssessment" (
      "id"            TEXT PRIMARY KEY,
      "companyId"     TEXT,
      "serviceUserId" TEXT NOT NULL,
      "type"          TEXT NOT NULL,
      "data"          TEXT NOT NULL DEFAULT '{}',
      "updatedById"   TEXT,
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RiskAssessment_serviceUserId_type_key" ON "RiskAssessment"("serviceUserId", "type")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskAssessment_companyId_idx" ON "RiskAssessment"("companyId")`);

  // ServiceUserNote — per-client office notes (council / social-work updates etc.).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServiceUserNote" (
      "id"            TEXT PRIMARY KEY,
      "companyId"     TEXT,
      "serviceUserId" TEXT NOT NULL,
      "category"      TEXT NOT NULL DEFAULT 'GENERAL',
      "body"          TEXT NOT NULL,
      "pinned"        BOOLEAN NOT NULL DEFAULT false,
      "createdById"   TEXT,
      "createdByName" TEXT NOT NULL,
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceUserNote_companyId_idx" ON "ServiceUserNote"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ServiceUserNote_serviceUserId_idx" ON "ServiceUserNote"("serviceUserId")`);

  // RespitePeriod — a client's away/respite window. No DB-level FK (Prisma
  // resolves the relation via serviceUserId); creating the table here keeps the
  // deploy migration-free and idempotent.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RespitePeriod" (
      "id"             TEXT PRIMARY KEY,
      "companyId"      TEXT,
      "serviceUserId"  TEXT NOT NULL,
      "startAt"        TIMESTAMP(3) NOT NULL,
      "endAt"          TIMESTAMP(3) NOT NULL,
      "note"           TEXT,
      "cancelledCount" INTEGER NOT NULL DEFAULT 0,
      "createdById"    TEXT,
      "createdByName"  TEXT NOT NULL,
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RespitePeriod_companyId_idx" ON "RespitePeriod"("companyId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RespitePeriod_serviceUserId_idx" ON "RespitePeriod"("serviceUserId")`);
  // Hospital admissions reuse this table: a type discriminator, and the ids of
  // the visits the period cancelled (so a return date can be extended/reduced,
  // restoring exactly those visits).
  await prisma.$executeRawUnsafe(`ALTER TABLE "RespitePeriod" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'RESPITE'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "RespitePeriod" ADD COLUMN IF NOT EXISTS "cancelledShiftIds" TEXT NOT NULL DEFAULT '[]'`);

  // Performance indexes for large Shift tables. Series-wide carer changes and
  // series deletes match a visit by (company, serviceUser, date); series ops
  // group/filter by seriesId. Without these, a big rota is fully scanned on
  // every "assign to all future", which is what pushes those saves past the
  // request timeout. Built CONCURRENTLY so the live table isn't write-locked
  // while the index is created, and wrapped so any hiccup never blocks startup
  // (a no-op on the next boot once the index exists).
  const shiftIndexes: [string, string][] = [
    ['Shift_companyId_serviceUserId_date_idx', `"companyId","serviceUserId","date"`],
    ['Shift_seriesId_idx', `"seriesId"`],
  ];
  for (const [name, cols] of shiftIndexes) {
    // Prefer CONCURRENTLY (no write-lock), but that fails through a connection
    // pooler ("cannot run inside a transaction block") — and Neon's pooled
    // endpoint would hit exactly that. Fall back to a plain CREATE INDEX, which
    // works everywhere; on these table sizes the brief lock is negligible. The
    // whole thing is guarded so a hiccup never blocks startup.
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "Shift"(${cols})`);
    } catch {
      try {
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${name}" ON "Shift"(${cols})`);
        console.log(`Created Shift index ${name} (plain).`);
      } catch (e) {
        console.error(`Shift index ${name} guard skipped:`, (e as Error).message);
      }
    }
  }
}
