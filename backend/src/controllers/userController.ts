import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { createPasswordSetupToken, portalUrlForRole } from './authController';
import { sendEmail, setPasswordEmail } from '../lib/email';
import { isScoped, staffInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';
import { capabilitiesFor, sanitiseCapabilityList } from '../middleware/permissions';
import { evaluateCompliance, ComplianceInput } from '../lib/staffCompliance';

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, role: true,
  hourlyRate: true, phone: true, photo: true, active: true, createdAt: true,
  customRoleId: true, permissionsOverride: true,
  customRole: { select: { id: true, name: true, baseType: true, permissions: true } },
  sites: { select: { id: true, name: true, color: true } },
  emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true, emergencyContactAddress: true,
  fitForWork: true,
};

// Parse a user's stored permission override (JSON array) or null if unset.
function parseOverride(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
}

// Resolves an optional custom-role id to a base account type, so an assigned
// role keeps a consistent base `role`. Throws a 400-style marker on bad id.
async function resolveCustomRole(customRoleId: string | null | undefined) {
  if (!customRoleId) return null;
  const role = await prisma.customRole.findUnique({ where: { id: customRoleId } });
  return role; // null if not found — caller decides how to handle
}

// Normalises a siteIds array from the request, and — for a scoped caller —
// restricts it to sites they themselves belong to (can't grant access to a
// site they can't see).
function requestedSiteIds(req: AuthRequest, siteIds: unknown): string[] {
  const list = Array.isArray(siteIds) ? siteIds.filter((x): x is string => typeof x === 'string') : [];
  return isScoped(req.user) ? list.filter((id) => req.user!.siteIds!.includes(id)) : list;
}

export async function listUsers(req: AuthRequest, res: Response) {
  const { role, active } = req.query;
  const where: Record<string, unknown> = {};
  // Family-member accounts are managed via the dedicated family-access UI,
  // not the staff list, so they're hidden unless explicitly requested.
  if (role) where.role = role;
  else where.role = { not: Role.FAMILY_MEMBER };
  if (active !== undefined) where.active = active === 'true';
  // A scoped viewer only sees staff sharing at least one of their sites
  // (plus themselves).
  if (isScoped(req.user)) {
    where.OR = [
      { sites: { some: { id: { in: req.user!.siteIds } } } },
      { id: req.user!.id },
    ];
  }
  const users = await prisma.user.findMany({ where, select: userSelect, orderBy: [{ firstName: 'asc' }] });
  // An outstanding setup token on an inactive account means the person was
  // invited but hasn't chosen a password yet — surfaced as "Pending".
  const tokens = await prisma.passwordSetupToken.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const invited = new Set(tokens.map((t) => t.userId));
  res.json(users.map((u) => ({ ...u, pendingSetup: !u.active && invited.has(u.id) })));
}

export async function getUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'User not found' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = await prisma.passwordSetupToken.findFirst({ where: { userId: user.id }, select: { id: true } });
  // Effective capabilities (per-person override > custom role > base matrix) and
  // the raw override, so the staff page can show and edit per-person permissions.
  const override = parseOverride(user.permissionsOverride);
  const roleCaps = (() => { try { return user.customRole ? JSON.parse(user.customRole.permissions) as string[] : null; } catch { return null; } })();
  const capabilities = await capabilitiesFor(user.role as Role, override ?? roleCaps);
  const { permissionsOverride, customRole, ...rest } = user;
  res.json({ ...rest, customRole: customRole ? { id: customRole.id, name: customRole.name, baseType: customRole.baseType } : null, permissionsOverride: override, capabilities, pendingSetup: !user.active && !!token });
}

// PUT /api/users/:id/permissions — set (or clear) this person's per-person
// permission override. Body { permissions: string[] | null }. Null reverts them
// to their role. Not allowed on full admins (they must stay full).
export async function setUserPermissions(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'User not found' });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, firstName: true, lastName: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === Role.ADMIN) {
    return res.status(400).json({ error: "Admins keep full access — set custom permissions on managers and staff instead." });
  }
  const raw = (req.body as { permissions?: unknown }).permissions;
  const value = raw == null ? null : JSON.stringify(sanitiseCapabilityList(raw));
  await prisma.user.update({ where: { id: req.params.id }, data: { permissionsOverride: value } });
  await logAudit(req, 'PERMISSIONS_UPDATED', `${target.firstName} ${target.lastName}`, value == null ? 'Reverted to role permissions' : 'Custom per-person permissions set');
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  const override = parseOverride(user!.permissionsOverride);
  const roleCaps = (() => { try { return user!.customRole ? JSON.parse(user!.customRole.permissions) as string[] : null; } catch { return null; } })();
  const capabilities = await capabilitiesFor(user!.role as Role, override ?? roleCaps);
  res.json({ permissionsOverride: override, capabilities });
}

// Builds a userId -> Set<category> map of document categories held, for the
// given staff ids. Used by both compliance endpoints.
async function docCategoriesByUser(userIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (userIds.length === 0) return map;
  const docs = await prisma.document.findMany({
    where: { ownerType: 'USER', ownerId: { in: userIds } },
    select: { ownerId: true, category: true },
  });
  for (const d of docs) {
    if (!d.category) continue;
    let s = map.get(d.ownerId);
    if (!s) { s = new Set(); map.set(d.ownerId, s); }
    s.add(d.category);
  }
  return map;
}

// GET /api/users/compliance — staff-file completeness for every in-scope active
// staff member, so the Staff list can flag anyone with missing documents.
export async function staffComplianceSummary(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = { role: { not: Role.FAMILY_MEMBER }, active: true };
  if (isScoped(req.user)) {
    where.OR = [
      { sites: { some: { id: { in: req.user!.siteIds } } } },
      { id: req.user!.id },
    ];
  }
  const users = await prisma.user.findMany({
    where,
    select: { id: true, photo: true, fitForWork: true, emergencyContactName: true },
  });
  const ids = users.map((u) => u.id);
  const [cats, training] = await Promise.all([
    docCategoriesByUser(ids),
    prisma.training.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const trainCount = new Map(training.map((t) => [t.userId, t._count._all]));
  const result = users.map((u) => {
    const input: ComplianceInput = {
      photo: u.photo,
      fitForWork: u.fitForWork,
      emergencyContactName: u.emergencyContactName,
      docCategories: cats.get(u.id) || new Set(),
      trainingCount: trainCount.get(u.id) || 0,
    };
    const r = evaluateCompliance(input);
    return { userId: u.id, complete: r.complete, present: r.present, total: r.total, missing: r.missing };
  });
  res.json(result);
}

// GET /api/users/:id/compliance — the full checklist breakdown for one staff
// member (used by the Compliance tab on their file).
export async function staffCompliance(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'User not found' });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, photo: true, fitForWork: true, emergencyContactName: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const [cats, trainingCount] = await Promise.all([
    docCategoriesByUser([user.id]),
    prisma.training.count({ where: { userId: user.id } }),
  ]);
  const result = evaluateCompliance({
    photo: user.photo,
    fitForWork: user.fitForWork,
    emergencyContactName: user.emergencyContactName,
    docCategories: cats.get(user.id) || new Set(),
    trainingCount,
  });
  res.json(result);
}

export async function createUser(req: AuthRequest, res: Response) {
  const { email, password, firstName, lastName, role, hourlyRate, phone, photo, sendInvite, customRoleId, siteIds } = req.body;
  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'email, firstName, lastName required' });
  }
  if (!sendInvite && !password) {
    return res.status(400).json({ error: 'password required unless sending an invite email' });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  // A custom role fixes the base account type; otherwise use the provided role.
  const customRole = await resolveCustomRole(customRoleId);
  if (customRoleId && !customRole) return res.status(400).json({ error: 'Unknown role' });
  const baseRole = customRole ? customRole.baseType : (role || Role.EMPLOYEE);

  // Inviting a carer to set their own password: the account still needs
  // *some* password to satisfy the schema, so it gets a random one nobody
  // knows — it's only ever replaced via the emailed set-password link.
  const hashed = await bcrypt.hash(sendInvite ? randomBytes(32).toString('hex') : password, 10);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashed,
      firstName,
      lastName,
      role: baseRole,
      customRoleId: customRole ? customRole.id : null,
      hourlyRate: hourlyRate ? Number(hourlyRate) : 0,
      phone: phone || null,
      photo: photo || null,
      // Invited users stay inactive (and can't log in) until they set their
      // own password via the emailed link; setPassword flips them active.
      active: sendInvite ? false : true,
      sites: { connect: requestedSiteIds(req, siteIds).map((id) => ({ id })) },
    },
    select: userSelect,
  });

  if (sendInvite) {
    const token = await createPasswordSetupToken(user.id);
    const link = `${portalUrlForRole(user.role)}/set-password?token=${token}`;
    sendEmail(user.email, 'Welcome to Caremid — set your password', setPasswordEmail(user.firstName, link));
  }

  await logAudit(req, 'STAFF_CREATED', `${user.firstName} ${user.lastName}`, `${user.email} · ${user.customRole?.name || user.role}`);
  res.status(201).json(user);
}

export async function updateUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { email, firstName, lastName, role, hourlyRate, phone, photo, active, customRoleId, siteIds, emergencyContactName, emergencyContactPhone, emergencyContactRelation, emergencyContactAddress, fitForWork } = req.body;
  const data: Record<string, unknown> = {};
  // Changing the login email — must stay unique. Only admins may change the
  // email of another admin account.
  if (email !== undefined && String(email).trim()) {
    const normalized = String(email).toLowerCase().trim();
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (target?.role === Role.ADMIN && req.user!.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Only an admin can change an admin account email' });
    }
    const clash = await prisma.user.findUnique({ where: { email: normalized } });
    if (clash && clash.id !== req.params.id) return res.status(409).json({ error: 'Email already in use' });
    data.email = normalized;
  }
  if (siteIds !== undefined) data.sites = { set: requestedSiteIds(req, siteIds).map((id) => ({ id })) };
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (role !== undefined && req.user!.role === Role.ADMIN) data.role = role;
  if (hourlyRate !== undefined) data.hourlyRate = Number(hourlyRate);
  if (phone !== undefined) data.phone = phone || null;
  if (photo !== undefined) data.photo = photo || null;
  if (active !== undefined && req.user!.role === Role.ADMIN) data.active = active;
  // Assigning a custom role also fixes the base account type. Only admins may
  // assign an admin-level role (prevents privilege escalation by managers).
  if (customRoleId !== undefined) {
    if (customRoleId) {
      const cr = await resolveCustomRole(customRoleId);
      if (!cr) return res.status(400).json({ error: 'Unknown role' });
      if (cr.baseType === Role.ADMIN && req.user!.role !== Role.ADMIN) {
        return res.status(403).json({ error: 'Only an admin can assign an admin-level role' });
      }
      data.customRoleId = cr.id;
      data.role = cr.baseType;
    } else {
      data.customRoleId = null;
    }
  }
  if (emergencyContactName !== undefined) data.emergencyContactName = emergencyContactName || null;
  if (emergencyContactPhone !== undefined) data.emergencyContactPhone = emergencyContactPhone || null;
  if (emergencyContactRelation !== undefined) data.emergencyContactRelation = emergencyContactRelation || null;
  if (emergencyContactAddress !== undefined) data.emergencyContactAddress = emergencyContactAddress || null;
  if (fitForWork !== undefined) data.fitForWork = fitForWork ?? null;

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: userSelect });

  // Record only sensitive changes (skip routine phone/photo/name edits).
  const sensitive = ['email', 'role', 'customRoleId', 'active', 'sites'].filter((k) => k in data);
  if (sensitive.length) {
    await logAudit(req, 'STAFF_UPDATED', `${user.firstName} ${user.lastName}`, `changed ${sensitive.join(', ')}`);
  }
  res.json(user);
}

// Re-sends the welcome / set-password email for someone who was invited but
// hasn't completed setup yet. Issues a fresh token (invalidating older links).
export async function resendInvite(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) return res.status(404).json({ error: 'User not found' });
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.active) return res.status(400).json({ error: 'This user has already set up their account' });
  await prisma.passwordSetupToken.deleteMany({ where: { userId: user.id } });
  const token = await createPasswordSetupToken(user.id);
  const link = `${portalUrlForRole(user.role)}/set-password?token=${token}`;
  sendEmail(user.email, 'Welcome to Caremid — set your password', setPasswordEmail(user.firstName, link));
  await logAudit(req, 'INVITE_RESENT', `${user.firstName} ${user.lastName}`, user.email);
  res.json({ message: 'Invite resent', email: user.email });
}

export async function deleteUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) return res.status(404).json({ error: 'User not found' });
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { active: false }, select: { firstName: true, lastName: true } });
  // Deactivating a never-activated ("Pending setup") account should void the
  // outstanding invite too, otherwise pendingSetup stays true and the person
  // keeps showing as "Pending" instead of "Deactivated".
  await prisma.passwordSetupToken.deleteMany({ where: { userId: req.params.id } });
  await logAudit(req, 'STAFF_DEACTIVATED', `${u.firstName} ${u.lastName}`);
  res.json({ message: 'User deactivated' });
}

export async function reactivateUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) return res.status(404).json({ error: 'User not found' });
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { active: true }, select: { firstName: true, lastName: true } });
  await logAudit(req, 'STAFF_REACTIVATED', `${u.firstName} ${u.lastName}`);
  res.json({ message: 'User reactivated' });
}

export async function permanentDeleteUser(req: AuthRequest, res: Response) {
  const id = req.params.id;
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  if (!(await staffInScope(req.user, id))) return res.status(404).json({ error: 'User not found' });
  const u = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true, email: true } });
  // Shifts, time-off, clock records and notifications cascade on user delete
  await prisma.user.delete({ where: { id } });
  await logAudit(req, 'STAFF_DELETED', u ? `${u.firstName} ${u.lastName}` : id, u?.email);
  res.json({ message: 'User deleted' });
}
