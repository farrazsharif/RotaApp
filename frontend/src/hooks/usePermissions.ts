import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import { useAuth } from '../contexts/AuthContext';
import { PermissionKey } from '../types';

// Fetches the effective permission map once (cached) and exposes can(key)
// for the current user's role. While loading, can() falls back to the
// built-in role rules so admins/managers don't see UI flicker.
export function usePermissions() {
  const { user, isAdmin, isManager } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: settingsApi.getPermissions,
    staleTime: 60_000,
    enabled: !!user,
  });

  function can(key: PermissionKey): boolean {
    if (!user) return false;
    if (data) return (data.permissions[key] || []).includes(user.role);
    // Fallback before the map loads: admin can do anything; manager gets the
    // common management capabilities. Backend is the real guard regardless.
    if (isAdmin) return true;
    const managerFallback: PermissionKey[] = [
      'manage_staff', 'manage_family_access', 'manage_service_users', 'manage_reviews',
      'manage_medications', 'manage_schedule', 'manage_time_off', 'view_reports', 'manage_sites',
    ];
    return isManager && managerFallback.includes(key);
  }

  return { can, definitions: data?.definitions ?? [], permissions: data?.permissions, isLoading };
}
