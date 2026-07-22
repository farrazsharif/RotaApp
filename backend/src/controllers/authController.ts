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
import { logAudit } from '../lib/audit';

// Which front-end a password/invite link should open in, by the user's role:
//   FAMILY_MEMBER → family portal, EMPLOYEE (carer) → Caremid Carer app,
//   ADMIN/MANAGER → main Caremid app.
export function portalUrlForRole(role: string): string {
  if (role === Role.FAMILY_MEMBER) return process.env.FAMILY_PORTAL_URL || 'http://localhost:5175';
  if (role === Role.EMPLOYEE) return process.env.CARER_APP_URL || 'http://localhost:5174';
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
  const custom = user.customRole ? (safeParse(user.customRole.permissions)) : null;
  const capabilities = await capabilitiesFor(user.role as Role, custom);
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

  // Default: email a reset link.
  const token = await createPasswordSetupToken(id);
  const link = `${portalUrlForRole(user.role)}/set-password?token=${token}`;
  sendEmail(user.email, 'Reset your Caremid password', resetPasswordEmail(user.firstName, link));
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
