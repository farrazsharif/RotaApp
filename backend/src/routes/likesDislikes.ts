import { Router } from 'express';
import { getLikesDislikes, upsertLikesDislikes } from '../controllers/likesDislikesController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserParam } from '../middleware/scope';

const router = Router();

router.use(authenticate);
router.use(scopeServiceUserParam);

// Any authenticated user (incl. carers) can view this.
router.get('/:serviceUserId', getLikesDislikes);
// Only admin/manager can write or amend it.
router.put('/:serviceUserId', requirePermission('manage_service_users'), upsertLikesDislikes);

export default router;
