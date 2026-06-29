import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { createPasswordSetupToken } from './authController';
import { sendEmail, setPasswordEmail } from '../lib/email';

const include = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, active: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

export async function listFamilyLinks(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  const links = await prisma.familyLink.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  res.json(links);
}

export async function createFamilyLink(req: AuthRequest, res: Response) {
  const { serviceUserId, email, firstName, lastName, relation } = req.body;
  if (!serviceUserId || !email || !firstName || !lastName) {
    return res.status(400).json({ error: 'serviceUserId, email, firstName, lastName required' });
  }

  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId } });
  if (!su) return res.status(404).json({ error: 'Service user not found' });

  let user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });

  if (user) {
    if (user.role !== Role.FAMILY_MEMBER) {
      return res.status(409).json({ error: 'This email already belongs to a staff account' });
    }
  } else {
    const hashed = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase(),
        password: hashed,
        firstName,
        lastName,
        role: Role.FAMILY_MEMBER,
      },
    });
    const token = await createPasswordSetupToken(user.id);
    const link = `${process.env.FAMILY_PORTAL_URL || 'http://localhost:5175'}/set-password?token=${token}`;
    sendEmail(user.email, 'You now have family portal access on RotaApp', setPasswordEmail(user.firstName, link));
  }

  const existingLink = await prisma.familyLink.findUnique({
    where: { userId_serviceUserId: { userId: user.id, serviceUserId } },
  });
  if (existingLink) return res.status(409).json({ error: 'This person already has access to this service user' });

  const created = await prisma.familyLink.create({
    data: { userId: user.id, serviceUserId, relation: relation || null },
    include,
  });
  res.status(201).json(created);
}

export async function deleteFamilyLink(req: AuthRequest, res: Response) {
  const existing = await prisma.familyLink.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Family link not found' });
  await prisma.familyLink.delete({ where: { id: req.params.id } });

  // If this was their only remaining link, deactivate the account so an
  // orphaned family-member login can't linger with no service user to view.
  const remaining = await prisma.familyLink.count({ where: { userId: existing.userId } });
  if (remaining === 0) {
    await prisma.user.update({ where: { id: existing.userId }, data: { active: false } });
  }
  res.json({ message: 'Access removed' });
}
