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
      'manage_medications', 'manage_schedule', 'manage_time_off', 'view_reports', 'manage_sites',
      'manage_billing',
    ];
    return isManager && managerFallback.includes(key);
  }

  return { can };
}
