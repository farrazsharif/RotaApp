import { AsyncLocalStorage } from 'async_hooks';

// Per-request tenant context. Set once we know which company the authenticated
// user belongs to, then read by the Prisma extension to scope every query.
export interface TenantContext {
  companyId: string;
  // When true, scoping is skipped entirely — used for platform-level work that
  // legitimately spans companies (login lookup, signup, Stripe webhooks,
  // background pollers). Use sparingly and deliberately.
  bypass?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const getTenant = (): TenantContext | undefined => storage.getStore();

export function runWithCompany<T>(companyId: string, fn: () => T): T {
  return storage.run({ companyId }, fn);
}

// Run a block with tenant scoping disabled (cross-company / platform work).
export function runWithoutScope<T>(fn: () => T): T {
  return storage.run({ companyId: '', bypass: true }, fn);
}
