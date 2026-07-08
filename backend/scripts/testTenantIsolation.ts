import { prisma } from '../src/lib/prisma';
import { runWithCompany, runWithoutScope } from '../src/lib/tenantContext';

// Verifies the automatic tenant scoping: two companies must never see each
// other's rows, and creates must be auto-stamped with the active company.
async function main() {
  const results: string[] = [];
  const assert = (label: string, ok: boolean) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`);

  // Existing seeded company (Caremid).
  const c1 = await runWithoutScope(() => prisma.company.findFirst({ where: { slug: 'caremid' } }));
  if (!c1) throw new Error('Company #1 not found');

  // Create a throwaway second company + one service user in it.
  const c2 = await runWithoutScope(() =>
    prisma.company.create({ data: { name: 'TestCo Ltd', slug: 'testco-' + Date.now(), subscriptionStatus: 'TRIALING' } }),
  );

  // Create a service user WHILE scoped to c2 — companyId should be auto-set.
  // Queries are awaited INSIDE the scope, exactly as an Express route handler runs.
  const suC2 = await runWithCompany(c2.id, async () =>
    prisma.serviceUser.create({ data: { firstName: 'Zzz', lastName: 'TestPatient', dateOfBirth: new Date('1950-01-01') } }),
  );
  assert('create auto-stamps companyId (c2)', suC2.companyId === c2.id);

  // Scoped to c1: must see its own 3 service users, and NOT c2's patient.
  const c1Count = await runWithCompany(c1.id, async () => prisma.serviceUser.count());
  const c1SeesC2 = await runWithCompany(c1.id, async () => prisma.serviceUser.findUnique({ where: { id: suC2.id } }));
  assert('c1 count excludes c2 patient (=3)', c1Count === 3);
  assert('c1 findUnique CANNOT read c2 patient', c1SeesC2 === null);

  // Scoped to c2: must see only its 1 patient.
  const c2Count = await runWithCompany(c2.id, async () => prisma.serviceUser.count());
  const c2SeesOwn = await runWithCompany(c2.id, async () => prisma.serviceUser.findUnique({ where: { id: suC2.id } }));
  assert('c2 count sees only its own (=1)', c2Count === 1);
  assert('c2 can read its own patient', c2SeesOwn?.id === suC2.id);

  // Cross-tenant update must not touch the other company's row.
  const crossUpd = await runWithCompany(c1.id, async () =>
    prisma.serviceUser.updateMany({ where: { id: suC2.id }, data: { lastName: 'HACKED' } }),
  );
  assert('c1 updateMany cannot modify c2 row (0 affected)', crossUpd.count === 0);

  // Cleanup: remove the throwaway company + its patient (unscoped).
  await runWithoutScope(async () => {
    await prisma.serviceUser.deleteMany({ where: { companyId: c2.id } });
    await prisma.company.delete({ where: { id: c2.id } });
  });

  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
