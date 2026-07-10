import type { PrismaClient } from '@prisma/client';
import { runWithCompany } from './tenantContext';

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
      'manage_supervision', 'edit_call_logs', 'manage_time_off', 'view_reports', 'manage_family_access',
    ],
  },
  {
    name: 'Field Supervisor',
    baseType: 'MANAGER',
    // Care-focused oversight: service users, care & service plans (incl. risk
    // assessments), eMAR, and spot checks / the supervision dashboard.
    permissions: ['manage_service_users', 'manage_medications', 'manage_supervision'],
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
    if (!exists) {
      await client.customRole.create({
        data: { companyId, name: r.name, baseType: r.baseType, permissions: JSON.stringify(r.permissions) },
      });
      created += 1;
      continue;
    }
    // Backfill: additively grant any new default capabilities to an existing
    // role (e.g. manage_supervision on a company created before that feature).
    // Only adds — never removes an admin's own tweaks.
    let current: string[];
    try { current = JSON.parse(exists.permissions); } catch { current = []; }
    const missing = r.permissions.filter((p) => !current.includes(p));
    if (missing.length) {
      await client.customRole.update({ where: { id: exists.id }, data: { permissions: JSON.stringify([...current, ...missing]) } });
    }
  }
  return created;
}

export type PrismaLike = PrismaClient;

// Runs ensureDefaultRoles for every existing company on startup, so new default
// capabilities (e.g. manage_supervision) reach companies created earlier.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillAllCompanyRoles(client: any): Promise<void> {
  const companies = await client.company.findMany({ select: { id: true } });
  for (const c of companies) {
    try {
      await runWithCompany(c.id, () => ensureDefaultRoles(client, c.id));
    } catch (e) {
      console.error(`Role backfill failed for company ${c.id}:`, e);
    }
  }
}
