import { Router } from 'express';
import { getCarePlan, upsertCarePlan } from '../controllers/carePlanController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Any authenticated user (incl. carers) can view a care plan.
router.get('/:serviceUserId', getCarePlan);
// Only admin/manager can write or amend it.
router.put('/:serviceUserId', requireRole('ADMIN', 'MANAGER'), upsertCarePlan);

export default router;
