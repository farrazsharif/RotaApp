import { Router } from 'express';
import { listReviews, getReview, createReview, updateReview, deleteReview } from '../controllers/reviewController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserRef, scopeRecordById } from '../middleware/scope';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);
// Guards creates (body.serviceUserId) and list-by-service-user (query).
router.use(scopeServiceUserRef);

const byReview = scopeRecordById((id) =>
  prisma.review.findUnique({ where: { id }, select: { serviceUserId: true } }).then((r) => r?.serviceUserId));

router.get('/', listReviews);
router.get('/:id', byReview, getReview);
router.post('/', requirePermission('manage_reviews'), createReview);
router.put('/:id', byReview, requirePermission('manage_reviews'), updateReview);
router.delete('/:id', byReview, requirePermission('manage_reviews'), deleteReview);

export default router;
