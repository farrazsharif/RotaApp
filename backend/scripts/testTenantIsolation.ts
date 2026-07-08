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

  // Per-company OrgSettings: each company gets its own settings row.
  const s1 = await runWithCompany(c1.id, async () =>
    prisma.orgSettings.upsert({ where: { companyId: c1.id }, update: {}, create: { companyId: c1.id } }),
  );
  const s2 = await runWithCompany(c2.id, async () =>
    prisma.orgSettings.upsert({ where: { companyId: c2.id }, update: { companyName: 'TestCo' }, create: { companyId: c2.id, companyName: 'TestCo' } }),
  );
  assert('OrgSettings are per-company (distinct rows)', !!s1 && !!s2 && s1.id !== s2.id);
  const c2Settings = await runWithCompany(c2.id, async () => prisma.orgSettings.findFirst());
  assert('c2 sees only its own settings (TestCo)', c2Settings?.companyName === 'TestCo');

  // Transaction-based write (mirrors shift createMany) is scoped + stamped.
  await runWithCompany(c2.id, async () =>
    prisma.$transaction(async (tx) => {
      await tx.site.create({ data: { name: 'TestSite-' + Date.now() } });
    }),
  );
  const c2Sites = await runWithCompany(c2.id, async () => prisma.site.count());
  const c1SeesC2Site = await runWithCompany(c1.id, async () => prisma.site.findMany({ where: { name: { startsWith: 'TestSite-' } } }));
  assert('tx create is scoped to c2 (c2 has 1 site)', c2Sites === 1);
  assert('c1 cannot see c2 tx-created site', c1SeesC2Site.length === 0);

  // Fail-loud guard: a write to a tenant model with NO tenant context at all
  // (a forgotten scope) must throw rather than create a null-companyId orphan.
  let threw = false;
  try {
    await prisma.site.create({ data: { name: 'Orphan' } });
  } catch { threw = true; }
  assert('no-context tenant-model create throws (no orphan)', threw);

  // Cleanup: remove all the throwaway company's data (unscoped).
  await runWithoutScope(async () => {
    await prisma.serviceUser.deleteMany({ where: { companyId: c2.id } });
    await prisma.site.deleteMany({ where: { companyId: c2.id } });
    await prisma.orgSettings.deleteMany({ where: { companyId: c2.id } });
    await prisma.company.delete({ where: { id: c2.id } });
  });

  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
