// Safety net for environments where the deploy doesn't run `prisma db push`:
// make sure the newer columns exist. Uses ADD COLUMN IF NOT EXISTS so it's
// idempotent and a no-op once the columns are present.
export async function ensureServiceUserColumns(prisma: any): Promise<void> {
  const cols = ['preferredName', 'gender', 'ethnicOrigin', 'keySafe', 'medsSafeCode'];
  for (const col of cols) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  }
  // JSON array column — non-null with a default so existing rows stay valid.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "supportCategories" TEXT NOT NULL DEFAULT '[]'`);
  // Flag marking an open-ended recurring series for the permanent top-up job.
  await prisma.$executeRawUnsafe(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "seriesPermanent" BOOLEAN NOT NULL DEFAULT false`);
  // Date the person started receiving care (nullable).
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "serviceStartDate" TIMESTAMP(3)`);
  // Supervision.nextReviewDate — the table is created by db push; guard the
  // column in case the table already existed from an earlier deploy.
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Supervision" ADD COLUMN IF NOT EXISTS "nextReviewDate" TIMESTAMP(3)`);
  } catch { /* table not created yet on this deploy; db push adds it with the column */ }
}
