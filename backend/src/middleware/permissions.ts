import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Role } from '../constants';
import { prisma } from '../lib/prisma';

export type PermissionKey =
  | 'manage_staff' | 'delete_staff' | 'reset_staff_passwords' | 'manage_family_access'
  | 'manage_service_users' | 'manage_reviews' | 'manage_medications' | 'edit_call_logs'
  | 'manage_schedule' | 'manage_time_off' | 'view_reports'
  | 'manage_sites' | 'manage_settings' | 'manage_permissions' | 'reset_test_data';

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  group: string;
  default: Role[];
  // Admin can never be un-granted these (prevents locking yourself out).
  protectedAdmin?: boolean;
}

const AM: Role[] = ['ADMIN', 'MANAGER'];
const A: Role[] = ['ADMIN'];

export const PERMISSIONS: PermissionDef[] = [
  { key: 'manage_staff',          label: 'Add & edit staff, resend invites', group: 'People',    default: AM },
  { key: 'delete_staff',          label: 'Deactivate & delete staff',        group: 'People',    default: A },
  { key: 'reset_staff_passwords', label: "Reset staff passwords",            group: 'People',    default: A },
  { key: 'manage_family_access',  label: 'Manage family portal access',      group: 'People',    default: AM },

  { key: 'manage_service_users',  label: 'Manage service users, care & service plans', group: 'Care', default: AM },
  { key: 'manage_reviews',        label: 'Create & edit reviews',            group: 'Care',      default: AM },
  { key: 'manage_medications',    label: 'Manage medications (eMAR)',        group: 'Care',      default: AM },
  { key: 'edit_call_logs',        label: 'Edit & delete call logs',          group: 'Care',      default: A },

  { key: 'manage_schedule',       label: 'Create & edit shifts, edit clock records', group: 'Scheduling', default: AM },
  { key: 'manage_time_off',       label: 'Review & decide time-off requests', group: 'Scheduling', default: AM },
  { key: 'view_reports',          label: 'View reports',                     group: 'Scheduling', default: AM },

  { key: 'manage_sites',          label: 'Manage sites / locations',         group: 'Administration', default: AM },
  { key: 'manage_settings',       label: 'Change organisation settings',     group: 'Administration', default: A, protectedAdmin: true },
  { key: 'manage_permissions',    label: 'Manage roles & permissions',       group: 'Administration', default: A, protectedAdmin: true },
  { key: 'reset_test_data',       label: 'Reset/wipe data',                  group: 'Administration', default: A, protectedAdmin: true },
];

const DEF_BY_KEY = new Map(PERMISSIONS.map((p) => [p.key, p]));

let cache: Record<string, Role[]> | null = null;
let cacheAt = 0;
const TTL_MS = 10_000;

export function clearPermissionCache() {
  cache = null;
}

// Merges stored overrides over the defaults, always keeping Admin on the
// protected capabilities so an admin can't remove their own access.
export async function getEffectivePermissions(): Promise<Record<string, Role[]>> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  const settings = await prisma.orgSettings.findUnique({ where: { id: 'org' } });
  let overrides: Record<string, string[]> = {};
  if (settings?.permissions) {
    try { overrides = JSON.parse(settings.permissions); } catch { overrides = {}; }
  }

  const map: Record<string, Role[]> = {};
  for (const def of PERMISSIONS) {
    const raw = Array.isArray(overrides[def.key]) ? (overrides[def.key] as Role[]) : def.default;
    // Only keep valid roles.
    let roles = raw.filter((r): r is Role => ['ADMIN', 'MANAGER', 'EMPLOYEE', 'FAMILY_MEMBER'].includes(r));
    if (def.protectedAdmin && !roles.includes('ADMIN')) roles = ['ADMIN', ...roles];
    map[def.key] = roles;
  }

  cache = map;
  cacheAt = Date.now();
  return map;
}

// Sanitises an incoming overrides object before persisting: drops unknown
// keys/roles and re-adds Admin to protected capabilities.
export function sanitisePermissions(input: unknown): Record<string, Role[]> {
  const out: Record<string, Role[]> = {};
  if (!input || typeof input !== 'object') return out;
  const validRoles: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'FAMILY_MEMBER'];
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    const def = DEF_BY_KEY.get(key as PermissionKey);
    if (!def || !Array.isArray(val)) continue;
    let roles = val.filter((r): r is Role => typeof r === 'string' && validRoles.includes(r as Role));
    if (def.protectedAdmin && !roles.includes('ADMIN')) roles = ['ADMIN', ...roles];
    out[key] = Array.from(new Set(roles));
  }
  return out;
}

export function requirePermission(key: PermissionKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const map = await getEffectivePermissions();
    const allowed = map[key] || [];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
