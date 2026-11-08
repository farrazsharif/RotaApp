import { Router } from 'express';
import { getLikesDislikes, upsertLikesDislikes } from '../controllers/likesDislikesController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserParam } from '../middleware/scope';

const router = Router();

router.use(authenticate);

// scopeServiceUserParam goes on each route, NOT on router.use: middleware
// mounted with `use` runs before the child route is matched, so req.params is
// empty there and the guard saw serviceUserId as undefined. It fails closed, so
// every site-scoped manager was refused with "This record is outside your
// assigned sites" on a client they could plainly access.
//
// Any authenticated user (incl. carers) can view this.
router.get('/:serviceUserId', scopeServiceUserParam, getLikesDislikes);
// Only admin/manager can write or amend it.
router.put('/:serviceUserId', scopeServiceUserParam, requirePermission('manage_service_users'), upsertLikesDislikes);

export default router;
