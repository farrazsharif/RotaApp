import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { sendEmail, resetPasswordEmail } from '../lib/email';
import { loadOrgSettings } from './settingsController';
import { capabilitiesFor } from '../middleware/permissions';
import { staffInScope } from '../lib/scope';
import { logAudit } from '../lib/audit';

// Which front-end a password/invite link should open in, by the user's role:
//   FAMILY_MEMBER → family portal, EMPLOYEE (carer) → Caremid Carer app,
//   ADMIN/MANAGER → main Caremid app.
// Derive a sibling app's URL from CLIENT_URL by swapping the first subdomain
// label (portal.caremid.co.uk -> carer.caremid.co.uk), so reset/invite links
// still work when CARER_APP_URL / FAMILY_PORTAL_URL aren't set — never localhost
// in production.
function siblingUrl(sub: string): string | null {
  const base = process.env.CLIENT_URL;
  if (!base) return null;
  try { const u = new URL(base); u.host = u.host.replace(/^[^.]+\./, `${sub}.`); return u.origin; } catch { return null; }
}

export function portalUrlForRole(role: string): string {
  if (role === Role.FAMILY_MEMBER) return process.env.FAMILY_PORTAL_URL || siblingUrl('family') || 'http://localhost:5175';
  if (role === Role.EMPLOYEE) return process.env.CARER_APP_URL || siblingUrl('carer') || 'http://localhost:5174';
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);

  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
}

export async function getMe(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { customRole: { select: { id: true, name: true, baseType: true, permissions: true } } },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Effective capabilities follow the same precedence as the staff page:
  // per-person override > custom role > base-role matrix. Previously this only
  // looked at the custom role, so a permission granted to one person via their
  // Permissions tab never reached their own session.
  const override = user.permissionsOverride != null ? safeParse(user.permissionsOverride) : null;
  const roleCaps = user.customRole ? safeParse(user.customRole.permissions) : null;
  const capabilities = await capabilitiesFor(user.role as Role, override ?? roleCaps);
  const { password: _, customRole, ...safeUser } = user;
  res.json({
    ...safeUser,
    customRole: customRole ? { id: customRole.id, name: customRole.name, baseType: customRole.baseType } : null,
    capabilities,
  });
}

function safeParse(s: string): string[] {
  try { return JSON.parse(s); } catch { return []; }
}

// Lets a signed-in user edit their own basic profile (name, phone, photo)
// without needing manager rights.
export async function updateMe(req: AuthRequest, res: Response) {
  const { email, firstName, lastName, phone, photo } = req.body;
  const data: Record<string, unknown> = {};
  if (email !== undefined && String(email).trim()) {
    const normalized = String(email).toLowerCase().trim();
    const clash = await prisma.user.findUnique({ where: { email: normalized } });
    if (clash && clash.id !== req.user!.id) return res.status(409).json({ error: 'Email already in use' });
    data.email = normalized;
  }
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (phone !== undefined) data.phone = phone || null;
  if (photo !== undefined) data.photo = photo || null;

  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  if (data.email) await logAudit(req, 'EMAIL_CHANGED', `${user.firstName} ${user.lastName}`, `to ${data.email}`);
  const { password: _, ...safeUser } = user;
  res.json(safeUser);
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.user!.id }, data: { password: hashed } });
  await logAudit(req, 'PASSWORD_CHANGED', req.user!.email, 'changed their own password');
  res.json({ message: 'Password updated' });
}

// Generates a one-time token a new staff member can use to set their own
// password, valid for 7 days. Used by createUser when a manager invites
// rather than sets a password directly.
export async function createPasswordSetupToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const { inviteExpiryDays } = await loadOrgSettings();
  const days = inviteExpiryDays && inviteExpiryDays > 0 ? inviteExpiryDays : 7;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.passwordSetupToken.create({ data: { userId, token, expiresAt } });
  return token;
}

// Lets the set-password page confirm the token is still valid before
// showing the form, without exposing anything about the user.
export async function checkSetPasswordToken(req: Request, res: Response) {
  const { token } = req.params;
  const record = await prisma.passwordSetupToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This link is invalid or has expired' });
  }
  res.json({ valid: true });
}

// Admin-initiated password reset. Two modes:
//   mode 'email'  → generate a set-password token and email the user a link
//                   (works for staff and family; picks the right portal URL).
//   mode 'set'    → set a new password directly (admin types it, then shares
//                   it with the person). Also clears any outstanding tokens.
export async function adminResetPassword(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { mode, password } = req.body as { mode?: string; password?: string };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (mode === 'set') {
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hashed = await bcrypt.hash(password, 10);
    // Setting a password manually completes onboarding: activate the account
    // (an invited/pending carer starts inactive and otherwise can't log in).
    await prisma.user.update({ where: { id }, data: { password: hashed, active: true } });
    await prisma.passwordSetupToken.deleteMany({ where: { userId: id } });
    await logAudit(req, 'PASSWORD_SET_BY_ADMIN', `${user.firstName} ${user.lastName}`, user.email);
    return res.json({ message: 'Password updated' });
  }

  // Default: email a reset link. Await the send and surface a real failure so
  // the admin isn't told "sent" when delivery actually failed.
  const token = await createPasswordSetupToken(id);
  const link = `${portalUrlForRole(user.role)}/set-password?token=${token}`;
  const sent = await sendEmail(user.email, 'Reset your Caremid password', resetPasswordEmail(user.firstName, link));
  if (!sent) {
    return res.status(502).json({ error: 'Reset link could not be emailed — check the mail settings. You can set a password manually instead.' });
  }
  await logAudit(req, 'PASSWORD_RESET_SENT', `${user.firstName} ${user.lastName}`, user.email);
  res.json({ message: 'Reset email sent', email: user.email });
}

// Self-service "forgot password": a carer/manager/family member enters their
// email and we send a reset link to the right portal. Always responds with a
// generic message so the endpoint can't be used to probe which emails exist,
// and only sends for active accounts (invited/pending use the invite flow).
export async function forgotPassword(req: Request, res: Response) {
  const generic = { message: 'If that email is registered, a password reset link has been sent.' };
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') return res.json(generic);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (user && user.active) {
    const token = await createPasswordSetupToken(user.id);
    const link = `${portalUrlForRole(user.role)}/set-password?token=${token}`;
    sendEmail(user.email, 'Reset your Caremid password', resetPasswordEmail(user.firstName, link));
  }
  res.json(generic);
}

// "View as carer": mint a short-lived session token for a staff member so a
// manager can open that person's app to check what they see — no password
// involved. Restricted (managers may view carers; only an admin may view
// another admin/manager) and audited. The token expires in 30 minutes.
export async function impersonateUser(req: AuthRequest, res: Response) {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!(await staffInScope(req.user, target.id))) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user!.id) return res.status(400).json({ error: 'You are already signed in as yourself' });
  if (target.role !== Role.EMPLOYEE && req.user!.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'You can only view a carer\'s app' });
  }
  if (!target.active) return res.status(400).json({ error: 'This account is not active yet' });

  const token = jwt.sign({ userId: target.id }, process.env.JWT_SECRET!, { expiresIn: '30m' } as jwt.SignOptions);
  await logAudit(req, 'VIEWED_AS_USER', `${target.firstName} ${target.lastName}`, `${target.email} — opened their app to check`);
  res.json({ token, url: portalUrlForRole(target.role) });
}

export async function setPassword(req: Request, res: Response) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const record = await prisma.passwordSetupToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This link is invalid or has expired' });
  }

  const hashed = await bcrypt.hash(password, 10);
  // Setting a password completes onboarding — activate the account so they
  // can log in (invited accounts start inactive/pending).
  await prisma.user.update({ where: { id: record.userId }, data: { password: hashed, active: true } });
  // One-time use — remove it (and any other outstanding tokens for this
  // user) so the same link can't be replayed.
  await prisma.passwordSetupToken.deleteMany({ where: { userId: record.userId } });

  res.json({ message: 'Password set successfully' });
}
