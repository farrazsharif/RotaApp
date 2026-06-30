import { Router } from 'express';
import { getLikesDislikes, upsertLikesDislikes } from '../controllers/likesDislikesController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Any authenticated user (incl. carers) can view this.
router.get('/:serviceUserId', getLikesDislikes);
// Only admin/manager can write or amend it.
router.put('/:serviceUserId', requireRole('ADMIN', 'MANAGER'), upsertLikesDislikes);

export default router;
