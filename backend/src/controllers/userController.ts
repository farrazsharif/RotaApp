import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { createPasswordSetupToken, portalUrlForRole } from './authController';
import { sendEmail, setPasswordEmail } from '../lib/email';
import { isScoped, staffInScope } from '../lib/scope';

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, role: true,
  hourlyRate: true, phone: true, photo: true, active: true, createdAt: true,
  customRoleId: true,
  customRole: { select: { id: true, name: true, baseType: true } },
  sites: { select: { id: true, name: true, color: true } },
  emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
};

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
  res.json({ ...user, pendingSetup: !user.active && !!token });
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

  res.status(201).json(user);
}

export async function updateUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { email, firstName, lastName, role, hourlyRate, phone, photo, active, customRoleId, siteIds, emergencyContactName, emergencyContactPhone, emergencyContactRelation } = req.body;
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

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: userSelect });
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
  res.json({ message: 'Invite resent', email: user.email });
}

export async function deleteUser(req: AuthRequest, res: Response) {
  if (!(await staffInScope(req.user, req.params.id))) return res.status(404).json({ error: 'User not found' });
  await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ message: 'User deactivated' });
}

export async function permanentDeleteUser(req: AuthRequest, res: Response) {
  const id = req.params.id;
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  if (!(await staffInScope(req.user, id))) return res.status(404).json({ error: 'User not found' });
  // Shifts, time-off, clock records and notifications cascade on user delete
  await prisma.user.delete({ where: { id } });
  res.json({ message: 'User deleted' });
}
