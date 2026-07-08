import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { runWithCompany } from '../lib/tenantContext';
import { hasAccess } from '../lib/subscription';
import { Role } from '../constants';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    companyId: string;
    role: Role;
    email: string;
    platformAdmin?: boolean;
    // Capability keys from an assigned custom role; null means "use the
    // base-role matrix instead".
    customPermissions?: string[] | null;
    // Sites this user is scoped to. Empty array = org-wide (no restriction).
    siteIds?: string[];
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, companyId: true, role: true, email: true, active: true, platformAdmin: true, customRole: { select: { permissions: true } }, sites: { select: { id: true } } },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Account not found or inactive' });
    }
    if (!user.companyId) {
      return res.status(401).json({ error: 'Account is not linked to a company' });
    }

    // Subscription/access gate. Billing and auth routes stay reachable so a
    // locked-out company can still see the paywall and go pay. Everything else
    // is blocked with 402 once the trial lapses (and no active subscription) or
    // the company is suspended at the platform level.
    const exempt = req.baseUrl.startsWith('/api/billing') || req.baseUrl.startsWith('/api/auth') || req.baseUrl.startsWith('/api/platform');
    if (!exempt) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { active: true, subscriptionStatus: true, trialEndsAt: true },
      });
      if (company && (!company.active || !hasAccess(company))) {
        return res.status(402).json({ error: 'Your subscription is inactive', code: 'SUBSCRIPTION_INACTIVE' });
      }
    }
    let customPermissions: string[] | null = null;
    if (user.customRole) {
      try { customPermissions = JSON.parse(user.customRole.permissions); } catch { customPermissions = []; }
    }
    req.user = { id: user.id, companyId: user.companyId, role: user.role as Role, email: user.email, platformAdmin: user.platformAdmin, customPermissions, siteIds: user.sites.map((s) => s.id) };
    // Activate tenant scoping for the remainder of this request so every
    // Prisma query is automatically filtered to this user's company.
    runWithCompany(user.companyId, () => next());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Guards the cross-company platform admin area. Only platform owners pass.
export function requirePlatformAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.platformAdmin) return res.status(403).json({ error: 'Platform admin access required' });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
