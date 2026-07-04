import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const SINGLETON_ID = 'org';

// Returns the org settings, creating the default row on first access.
export async function getOrgSettings(_req: AuthRequest, res: Response) {
  const settings = await prisma.orgSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  res.json(settings);
}

// Convenience for other controllers that need a setting (e.g. invite expiry,
// overtime threshold) without duplicating the upsert.
export async function loadOrgSettings() {
  return prisma.orgSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

const STRING_FIELDS = ['companyName', 'logo', 'address', 'phone', 'email', 'cqcProviderId', 'icoNumber', 'timezone', 'defaultRole'] as const;
const NUMBER_FIELDS = ['defaultHourlyRate', 'overtimeThreshold', 'inviteExpiryDays'] as const;

export async function updateOrgSettings(req: AuthRequest, res: Response) {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

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

  const settings = await prisma.orgSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  res.json(settings);
}
