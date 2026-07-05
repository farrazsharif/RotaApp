import { AuthRequest } from '../middleware/auth';
import { prisma } from './prisma';

type ReqUser = AuthRequest['user'];

// A user is site-scoped when they have one or more sites assigned. No sites =
// org-wide access (the default / backwards-compatible behaviour).
export function isScoped(user?: ReqUser): boolean {
  return !!user?.siteIds && user.siteIds.length > 0;
}

// Prisma where-fragment for querying service users within scope. Returns {}
// when org-wide so it can be spread into any existing where clause.
export function serviceUserScopeWhere(user?: ReqUser): Record<string, unknown> {
  return isScoped(user) ? { siteId: { in: user!.siteIds } } : {};
}

// Where-fragment for models that reference a service user via `serviceUser`
// relation (reviews, call logs, medications…). {} when org-wide.
export function relatedServiceUserScopeWhere(user?: ReqUser): Record<string, unknown> {
  return isScoped(user) ? { serviceUser: { siteId: { in: user!.siteIds } } } : {};
}

// Where-fragment for models referencing staff via a `user` relation (clock
// records) — limits to staff sharing the caller's sites. {} when org-wide.
export function relatedStaffScopeWhere(user?: ReqUser): Record<string, unknown> {
  return isScoped(user) ? { user: { sites: { some: { id: { in: user!.siteIds } } } } } : {};
}

// True if the given service user is within the caller's scope (always true for
// org-wide users). A service user with no site is only visible org-wide.
export async function serviceUserInScope(user: ReqUser, serviceUserId?: string | null): Promise<boolean> {
  if (!isScoped(user)) return true;
  if (!serviceUserId) return false;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { siteId: true } });
  return !!su && !!su.siteId && user!.siteIds!.includes(su.siteId);
}

// True if the caller may see/act on the given staff member: org-wide callers
// can see everyone; scoped callers only see themselves and staff who share at
// least one of their sites.
export async function staffInScope(user: ReqUser, targetUserId: string): Promise<boolean> {
  if (!isScoped(user)) return true;
  if (targetUserId === user!.id) return true;
  const match = await prisma.user.findFirst({
    where: { id: targetUserId, sites: { some: { id: { in: user!.siteIds } } } },
    select: { id: true },
  });
  return !!match;
}
