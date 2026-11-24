import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { runWithoutScope } from '../lib/tenantContext';
import { ensureDefaultRoles } from '../lib/defaultRoles';
import { Role } from '../constants';
import { sendEmail, welcomeEmail, newSignupEmail } from '../lib/email';
import { portalUrlForRole } from './authController';

const TRIAL_DAYS = 14;

// Turns a company name into a URL-safe slug for its subdomain.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'company';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Company lookups are cross-tenant; run unscoped.
  while (await runWithoutScope(() => prisma.company.findUnique({ where: { slug } }))) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

// Public self-serve signup: creates a new company workspace + its first admin,
// starts a free trial, and returns a login token — no existing account needed.
export async function signup(req: Request, res: Response) {
  const { companyName, firstName, lastName, email, password, phone } = req.body as Record<string, string>;

  if (!companyName || !firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  // Email is globally unique across all companies.
  const existing = await runWithoutScope(() => prisma.user.findUnique({ where: { email: normalizedEmail } }));
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const slug = await uniqueSlug(slugify(companyName));
  const hashed = await bcrypt.hash(password, 10);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { user, company } = await runWithoutScope(() =>
    prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
          slug,
          subscriptionStatus: 'TRIALING',
          trialEndsAt,
        },
      });
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: normalizedEmail,
          password: hashed,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          // Optional, and kept as typed. A phone number is for a human to ring,
          // not for the software to parse, so there is nothing to validate
          // beyond a sane length — reformatting somebody's number or rejecting
          // a perfectly good one is worse than storing it as they wrote it.
          phone: typeof phone === 'string' && phone.trim() ? phone.trim().slice(0, 40) : null,
          role: Role.ADMIN,
          active: true,
        },
      });
      await tx.orgSettings.create({
        data: { companyId: company.id, companyName: companyName.trim() },
      });
      // Give every new company the standard staff-category roles.
      await ensureDefaultRoles(tx, company.id);
      return { user, company };
    }),
  );

  // Welcome them. Fire-and-forget on purpose: a mail outage must not fail a
  // signup that has already created the company, and the person is about to
  // be logged straight in anyway.
  sendEmail(
    user.email,
    `Welcome to Caremid, ${companyName.trim()}`,
    welcomeEmail(
      user.firstName,
      companyName.trim(),
      trialEndsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      portalUrlForRole(Role.ADMIN),
    ),
  );

  // And tell whoever runs Caremid, so a trial does not sit unnoticed.
  //
  // Recipients are the platform admins by default, which needs no
  // configuration and stays right as that list changes. SIGNUP_NOTIFY_EMAIL
  // (comma-separated) overrides when the notification should go somewhere
  // else, such as a shared sales inbox.
  void (async () => {
    try {
      const override = (process.env.SIGNUP_NOTIFY_EMAIL || '')
        .split(',').map((e) => e.trim()).filter(Boolean);
      const to = override.length
        ? override
        : (await runWithoutScope(() => prisma.user.findMany({
            where: { platformAdmin: true, active: true },
            select: { email: true },
          }))).map((u) => u.email);
      if (!to.length) return;
      const html = newSignupEmail({
        companyName: company.name,
        slug: company.slug,
        contactName: `${user.firstName} ${user.lastName}`.trim(),
        contactEmail: user.email,
        contactPhone: user.phone,
        trialEnds: trialEndsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        signedUpAt: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
        platformUrl: portalUrlForRole(Role.ADMIN),
      });
      for (const address of to) await sendEmail(address, `New Caremid trial: ${company.name}`, html);
    } catch (err) {
      // Never let the notification break a signup that already succeeded.
      console.error('New-signup notification failed:', err);
    }
  })();

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);

  const { password: _pw, ...safeUser } = user;
  res.status(201).json({
    token,
    user: safeUser,
    company: { id: company.id, name: company.name, slug: company.slug, trialEndsAt: company.trialEndsAt },
  });
}
