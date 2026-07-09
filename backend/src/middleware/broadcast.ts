import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { emitToCompany } from '../lib/socket';

// Global middleware: after ANY successful (2xx) write request, broadcast a
// `data:changed` event to the acting user's company room, so every open session
// in that company refetches its data and everyone sees changes live — with no
// manual refresh and no per-route wiring to maintain as features are added.
export function broadcastChanges(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    // req.user is populated by each router's authenticate middleware while the
    // request runs; by the time the response finishes it's available here.
    const user = req.user;
    if (res.statusCode >= 200 && res.statusCode < 300 && user?.companyId) {
      emitToCompany(user.companyId, 'data:changed', { resource: req.baseUrl || req.path });
    }
  });
  next();
}
