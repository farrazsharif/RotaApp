import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { isScoped, serviceUserInScope } from '../lib/scope';

const DENIED = { error: 'This record is outside your assigned sites' };

// Guards routes that reference a service user via body/query `serviceUserId`
// (creates and list-by-service-user). If none is present, it lets the request
// through (list-all endpoints handle their own filtering).
export async function scopeServiceUserRef(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isScoped(req.user)) return next();
  const suId = (req.body?.serviceUserId ?? req.query?.serviceUserId) as string | undefined;
  if (suId === undefined) return next();
  if (await serviceUserInScope(req.user, suId)) return next();
  return res.status(403).json(DENIED);
}

// Guards routes addressed as `/:serviceUserId` (care plan, service plan, etc.).
//
// Attach this to the ROUTE, never via router.use(): `use` middleware runs
// before the child route is matched, so req.params is empty and every scoped
// caller is denied. That is hard to spot, because it fails closed and the
// message blames the client's site, so say so out loud instead.
export async function scopeServiceUserParam(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isScoped(req.user)) return next();
  if (req.params.serviceUserId === undefined) {
    console.error(`[scope] scopeServiceUserParam has no :serviceUserId on ${req.method} ${req.baseUrl}${req.path} — attach it to the route, not router.use()`);
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  if (await serviceUserInScope(req.user, req.params.serviceUserId)) return next();
  return res.status(403).json(DENIED);
}

// Guards mutation of a nested record addressed by `:id`, by resolving that
// record back to its owning serviceUserId.
export function scopeRecordById(resolve: (id: string) => Promise<string | null | undefined>) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isScoped(req.user)) return next();
    const suId = await resolve(req.params.id);
    if (await serviceUserInScope(req.user, suId ?? undefined)) return next();
    return res.status(403).json(DENIED);
  };
}
