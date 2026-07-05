import { Router } from 'express';
import { listReviews, getReview, createReview, updateReview, deleteReview } from '../controllers/reviewController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listReviews);
router.get('/:id', getReview);
router.post('/', requirePermission('manage_reviews'), createReview);
router.put('/:id', requirePermission('manage_reviews'), updateReview);
router.delete('/:id', requirePermission('manage_reviews'), deleteReview);

export default router;
