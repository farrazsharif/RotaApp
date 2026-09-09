import { Router } from 'express';
import { listLikesDislikesVersions, getLikesDislikesVersion, createLikesDislikesVersion } from '../controllers/likesDislikesVersionController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Viewing past reviews is open to any authenticated user; completing a review
// (archiving a snapshot) is a care-management action (same gate as editing the record).
router.get('/', listLikesDislikesVersions);
router.get('/:id', getLikesDislikesVersion);
router.post('/', requirePermission('manage_service_users'), createLikesDislikesVersion);

export default router;
