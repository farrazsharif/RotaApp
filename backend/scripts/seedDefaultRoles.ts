import { PrismaClient } from '@prisma/client';
import { ensureDefaultRoles } from '../src/lib/defaultRoles';

// Backfills the standard staff-category roles into every existing company.
// Run with an inline DATABASE_URL to target dev or prod.
const p = new PrismaClient();

(async () => {
  const companies = await p.company.findMany();
  for (const c of companies) {
    const n = await ensureDefaultRoles(p, c.id);
    console.log(`${c.name.padEnd(20)} -> created ${n} role(s)`);
  }
  const roles = await p.customRole.groupBy({ by: ['name'], _count: { _all: true } });
  console.log('\nRoles across companies:', roles.map((r) => `${r.name} x${r._count._all}`).join(', '));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
