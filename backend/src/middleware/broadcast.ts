import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { emitToCompany } from '../lib/socket';

// Express middleware factory. After a successful (2xx) non-GET request, it
// broadcasts a `data:changed` event to the company room naming the query
// "topics" the change affects, so every open session in the company refetches
// just those screens (schedule, dashboard, attendance…) without a manual
// refresh. Topics are React Query key roots on the client.
export function broadcastOnSuccess(...topics: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next();
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.companyId) {
        emitToCompany(req.user.companyId, 'data:changed', { topics });
      }
    });
    next();
  };
}
