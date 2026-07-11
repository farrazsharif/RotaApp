// Safety net for environments where the deploy doesn't run `prisma db push`:
// make sure the newer, nullable ServiceUser columns exist. Uses ADD COLUMN IF
// NOT EXISTS so it's idempotent and a no-op once the columns are present.
export async function ensureServiceUserColumns(prisma: any): Promise<void> {
  const cols = ['preferredName', 'gender', 'ethnicOrigin', 'keySafe'];
  for (const col of cols) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceUser" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
  }
}
