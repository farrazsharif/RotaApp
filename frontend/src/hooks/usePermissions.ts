import { useAuth } from '../contexts/AuthContext';
import { PermissionKey } from '../types';

// can(key) checks the current user's effective capabilities, which the backend
// computes on /auth/me from either their custom role or the base-role matrix.
// Falls back to the base account type if capabilities aren't present yet.
export function usePermissions() {
  const { user, isAdmin, isManager } = useAuth();

  function can(key: PermissionKey): boolean {
    if (!user) return false;
    if (user.capabilities) return user.capabilities.includes(key);
    if (isAdmin) return true;
    const managerFallback: PermissionKey[] = [
      'manage_staff', 'manage_family_access', 'manage_service_users', 'manage_reviews',
      'manage_medications', 'manage_supervision', 'manage_schedule', 'manage_time_off', 'view_reports', 'manage_sites',
      'manage_billing',
    ];
    return isManager && managerFallback.includes(key);
  }

  // Mirrors the backend site-scope guard (backend/src/lib/scope.ts): a user with
  // one or more assigned sites is "site-scoped" and may only view/edit clients in
  // those sites; a user with no sites has org-wide access. Carers are never
  // site-scoped. Use this to keep the UI honest — the server refuses writes to a
  // client outside the caller's sites, so we shouldn't offer an Edit button that
  // leads to a "This record is outside your assigned sites" failure.
  function canAccessSite(siteId?: string | null): boolean {
    if (!user) return false;
    const scoped = user.role !== 'EMPLOYEE' && !!user.sites && user.sites.length > 0;
    if (!scoped) return true;
    if (!siteId) return false; // a client with no site is only visible org-wide
    return user.sites!.some((s) => s.id === siteId);
  }

  return { can, canAccessSite };
}
