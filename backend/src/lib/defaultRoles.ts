import type { PrismaClient } from '@prisma/client';

// Standard staff categories every company gets out of the box. Both are
// MANAGER-based so they use the manager portal (and can also use the carer app
// for visits); their capability lists scope what they can actually do.
export const DEFAULT_ROLES: { name: string; baseType: string; permissions: string[] }[] = [
  {
    name: 'Care Coordinator',
    baseType: 'MANAGER',
    // Full day-to-day coordination: rota, service users & plans, reviews, eMAR,
    // call logs, time-off and reports. No billing/settings/staff-admin.
    permissions: [
      'manage_schedule', 'manage_service_users', 'manage_reviews', 'manage_medications',
      'edit_call_logs', 'manage_time_off', 'view_reports', 'manage_family_access',
    ],
  },
  {
    name: 'Field Supervisor',
    baseType: 'MANAGER',
    // Care-focused oversight: service users, care & service plans (incl. risk
    // assessments) and eMAR. (Spot checks are a separate feature — not built yet.)
    permissions: ['manage_service_users', 'manage_medications'],
  },
];

// Creates any missing default roles for a company. Idempotent — safe to call on
// signup and to backfill existing companies. `client` is a tenant-scoped client
// (or a transaction) already bound to the company, plus the companyId for the
// create payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDefaultRoles(client: any, companyId: string): Promise<number> {
  let created = 0;
  for (const r of DEFAULT_ROLES) {
    const exists = await client.customRole.findFirst({ where: { name: r.name, companyId } });
    if (exists) continue;
    await client.customRole.create({
      data: { companyId, name: r.name, baseType: r.baseType, permissions: JSON.stringify(r.permissions) },
    });
    created += 1;
  }
  return created;
}

export type PrismaLike = PrismaClient;
