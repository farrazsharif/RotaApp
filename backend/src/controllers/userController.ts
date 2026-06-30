import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { createPasswordSetupToken } from './authController';
import { sendEmail, setPasswordEmail } from '../lib/email';

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, role: true,
  hourlyRate: true, phone: true, active: true, createdAt: true,
  emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
};

export async function listUsers(req: AuthRequest, res: Response) {
  const { role, active } = req.query;
  const where: Record<string, unknown> = {};
  // Family-member accounts are managed via the dedicated family-access UI,
  // not the staff list, so they're hidden unless explicitly requested.
  if (role) where.role = role;
  else where.role = { not: Role.FAMILY_MEMBER };
  if (active !== undefined) where.active = active === 'true';
  const users = await prisma.user.findMany({ where, select: userSelect, orderBy: [{ firstName: 'asc' }] });
  res.json(users);
}

export async function getUser(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}

export async function createUser(req: AuthRequest, res: Response) {
  const { email, password, firstName, lastName, role, hourlyRate, phone, sendInvite } = req.body;
  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'email, firstName, lastName required' });
  }
  if (!sendInvite && !password) {
    return res.status(400).json({ error: 'password required unless sending an invite email' });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

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
      role: role || Role.EMPLOYEE,
      hourlyRate: hourlyRate ? Number(hourlyRate) : 0,
      phone: phone || null,
    },
    select: userSelect,
  });

  if (sendInvite) {
    const token = await createPasswordSetupToken(user.id);
    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/set-password?token=${token}`;
    sendEmail(user.email, 'Welcome to RotaApp — set your password', setPasswordEmail(user.firstName, link));
  }

  res.status(201).json(user);
}

export async function updateUser(req: AuthRequest, res: Response) {
  const { firstName, lastName, role, hourlyRate, phone, active, emergencyContactName, emergencyContactPhone, emergencyContactRelation } = req.body;
  const data: Record<string, unknown> = {};
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (role !== undefined && req.user!.role === Role.ADMIN) data.role = role;
  if (hourlyRate !== undefined) data.hourlyRate = Number(hourlyRate);
  if (phone !== undefined) data.phone = phone || null;
  if (active !== undefined && req.user!.role === Role.ADMIN) data.active = active;
  if (emergencyContactName !== undefined) data.emergencyContactName = emergencyContactName || null;
  if (emergencyContactPhone !== undefined) data.emergencyContactPhone = emergencyContactPhone || null;
  if (emergencyContactRelation !== undefined) data.emergencyContactRelation = emergencyContactRelation || null;

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: userSelect });
  res.json(user);
}

export async function deleteUser(req: AuthRequest, res: Response) {
  await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ message: 'User deactivated' });
}

export async function permanentDeleteUser(req: AuthRequest, res: Response) {
  const id = req.params.id;
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  // Remove records that would block deletion (shift trades have no cascade)
  await prisma.shiftTrade.deleteMany({ where: { OR: [{ requesterId: id }, { targetUserId: id }] } });
  // Shifts, time-off, clock records and notifications cascade on user delete
  await prisma.user.delete({ where: { id } });
  res.json({ message: 'User deleted' });
}
