import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { PERMISSIONS, getEffectivePermissions, sanitisePermissions, clearPermissionCache } from '../middleware/permissions';
import { logAudit } from '../lib/audit';
import { getTenant } from '../lib/tenantContext';
import { normaliseRequirements } from '../lib/staffCompliance';

// The company whose settings we're reading/writing. The tenant extension scopes
// every query, but upsert/create still need the companyId value explicitly.
function currentCompanyId(): string {
  const id = getTenant()?.companyId;
  if (!id) throw new Error('No company in scope');
  return id;
}

// Returns the org settings for the current company, creating the default row on
// first access. Keyed by companyId (one settings row per company).
async function upsertOrgSettings(update: Record<string, unknown> = {}) {
  const companyId = currentCompanyId();
  return prisma.orgSettings.upsert({
    where: { companyId },
    update,
    create: { companyId, ...update },
  });
}

// Returns the permission definitions plus the current effective role map, so
// the UI can both render the matrix and gate its own controls.
export async function getPermissions(_req: AuthRequest, res: Response) {
  const permissions = await getEffectivePermissions();
  res.json({ definitions: PERMISSIONS, permissions });
}

export async function updatePermissions(req: AuthRequest, res: Response) {
  const clean = sanitisePermissions((req.body as { permissions?: unknown })?.permissions);
  await upsertOrgSettings({ permissions: JSON.stringify(clean) });
  clearPermissionCache();
  await logAudit(req, 'PERMISSIONS_UPDATED', 'Role permission matrix');
  const permissions = await getEffectivePermissions();
  res.json({ definitions: PERMISSIONS, permissions });
}

// Returns the org settings, creating the default row on first access.
export async function getOrgSettings(_req: AuthRequest, res: Response) {
  const settings = await upsertOrgSettings();
  res.json(settings);
}

// Convenience for other controllers that need a setting (e.g. invite expiry,
// overtime threshold) without duplicating the upsert.
export async function loadOrgSettings() {
  return upsertOrgSettings();
}

const STRING_FIELDS = ['companyName', 'logo', 'address', 'phone', 'email', 'cqcProviderId', 'icoNumber', 'timezone', 'defaultRole'] as const;
const NUMBER_FIELDS = ['defaultHourlyRate', 'overtimeThreshold', 'inviteExpiryDays'] as const;

// Clean the carer-app visit checklist into a stored JSON string: array of
// { id, label, phrase?, detail? }. Anything malformed is dropped. Accepts either
// an array or a JSON-string of one (the Settings form sends a stringified list).
function normalizeCallLogTasks(raw: unknown): string {
  let arr: unknown = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return '[]'; }
  }
  if (!Array.isArray(arr)) return '[]';
  const clean = arr
    .filter((t) => t && typeof t === 'object' && typeof (t as any).label === 'string' && String((t as any).label).trim())
    .slice(0, 100)
    .map((t: any, i: number) => ({
      id: String(t.id || `task-${i}`).slice(0, 60),
      label: String(t.label).trim().slice(0, 80),
      ...(t.phrase && String(t.phrase).trim() ? { phrase: String(t.phrase).trim().slice(0, 160) } : {}),
      ...(t.detail ? { detail: true } : {}),
    }));
  return JSON.stringify(clean);
}

// Clean the editable staff-file compliance checklist into a stored JSON string.
// Accepts an array or a JSON-string of one. An empty array is stored as '[]',
// which the reader treats as "use the built-in defaults".
function normalizeStaffFileRequirements(raw: unknown): string {
  let arr: unknown = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return '[]'; }
  }
  if (!Array.isArray(arr)) return '[]';
  return JSON.stringify(normaliseRequirements(arr));
}

export async function updateOrgSettings(req: AuthRequest, res: Response) {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.callLogTasks !== undefined) {
    data.callLogTasks = normalizeCallLogTasks(body.callLogTasks);
  }

  if (body.staffFileRequirements !== undefined) {
    data.staffFileRequirements = normalizeStaffFileRequirements(body.staffFileRequirements);
  }

  for (const key of STRING_FIELDS) {
    if (body[key] !== undefined) {
      // companyName can't be blanked; the rest may be cleared to null.
      if (key === 'companyName') data[key] = String(body[key]) || 'Caremid';
      else data[key] = body[key] ? String(body[key]) : null;
    }
  }
  for (const key of NUMBER_FIELDS) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      data[key] = Number.isFinite(n) ? n : 0;
    }
  }

  const settings = await upsertOrgSettings(data);
  await logAudit(req, 'SETTINGS_UPDATED', 'Organisation settings', Object.keys(data).join(', '));
  res.json(settings);
}
