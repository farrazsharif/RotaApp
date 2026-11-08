import { AuthRequest } from '../middleware/auth';
import { prisma } from './prisma';
import { Role } from '../constants';

type ReqUser = AuthRequest['user'];

// A user is site-scoped when they have one or more sites assigned. No sites =
// org-wide access (the default / backwards-compatible behaviour).
//
// Carers (EMPLOYEE) are NEVER treated as site-scoped: a carer's access is
// defined by the shifts they're assigned to, not by branch. A manager can
// cross-assign a carer to a client in another site, so site-scoping the carer
// would hide their own assigned visit (and block opening/clocking/med/logs for
// it). Their own-shift filters already limit them to their assignments.
export function isScoped(user?: ReqUser): boolean {
  if (!user || user.role === Role.EMPLOYEE) return false;
  return !!user.siteIds && user.siteIds.length > 0;
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

// Which staff a site-scoped caller may see. Three branches, and the middle one
// is the important one:
//
//   1. staff sharing one of the caller's sites — the obvious case;
//   2. staff with NO sites at all — the staff form promises "Leave all
//      unselected for full access to every site", so someone unselected belongs
//      everywhere and must be visible to every manager. Prisma's `some` never
//      matches an empty relation, so without this branch leaving sites blank
//      quietly did the opposite of what the form says: it hid the person from
//      every scoped manager, and from the carer picker when assigning shifts.
//      It also meant a scoped manager who created a carer without ticking a
//      site could never see or edit that record again;
//   3. the caller themselves, who may have no sites in common with anyone.
export function staffScopeOr(user: ReqUser) {
  return [
    { sites: { some: { id: { in: user!.siteIds } } } },
    { sites: { none: {} } },
    { id: user!.id },
  ];
}

// Where-fragment for models referencing staff via a `user` relation (clock
// records) — limits to staff in the caller's scope. {} when org-wide.
export function relatedStaffScopeWhere(user?: ReqUser): Record<string, unknown> {
  return isScoped(user) ? { user: { OR: staffScopeOr(user) } } : {};
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
// can see everyone; scoped callers see themselves, staff sharing one of their
// sites, and staff who belong to no site (see staffScopeOr).
export async function staffInScope(user: ReqUser, targetUserId: string): Promise<boolean> {
  if (!isScoped(user)) return true;
  if (targetUserId === user!.id) return true;
  const match = await prisma.user.findFirst({
    where: { id: targetUserId, OR: staffScopeOr(user) },
    select: { id: true },
  });
  return !!match;
}
