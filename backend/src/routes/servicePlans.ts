import { Router } from 'express';
import { getServicePlan, upsertServicePlan } from '../controllers/servicePlanController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Any authenticated user (incl. carers) can view; only admin/manager can edit.
router.get('/:serviceUserId', getServicePlan);
router.put('/:serviceUserId', requireRole('ADMIN', 'MANAGER'), upsertServicePlan);

export default router;
