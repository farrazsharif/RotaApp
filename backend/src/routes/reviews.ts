import { Router } from 'express';
import { listReviews, getReview, createReview, updateReview, deleteReview } from '../controllers/reviewController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listReviews);
router.get('/:id', getReview);
router.post('/', requireRole(Role.ADMIN, Role.MANAGER), createReview);
router.put('/:id', requireRole(Role.ADMIN, Role.MANAGER), updateReview);
router.delete('/:id', requireRole(Role.ADMIN, Role.MANAGER), deleteReview);

export default router;
