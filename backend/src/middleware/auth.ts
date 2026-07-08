import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { runWithCompany } from '../lib/tenantContext';
import { Role } from '../constants';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    companyId: string;
    role: Role;
    email: string;
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
      select: { id: true, companyId: true, role: true, email: true, active: true, customRole: { select: { permissions: true } }, sites: { select: { id: true } } },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Account not found or inactive' });
    }
    if (!user.companyId) {
      return res.status(401).json({ error: 'Account is not linked to a company' });
    }
    let customPermissions: string[] | null = null;
    if (user.customRole) {
      try { customPermissions = JSON.parse(user.customRole.permissions); } catch { customPermissions = []; }
    }
    req.user = { id: user.id, companyId: user.companyId, role: user.role as Role, email: user.email, customPermissions, siteIds: user.sites.map((s) => s.id) };
    // Activate tenant scoping for the remainder of this request so every
    // Prisma query is automatically filtered to this user's company.
    runWithCompany(user.companyId, () => next());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
