import { Router } from 'express';
import { getServicePlan, upsertServicePlan } from '../controllers/servicePlanController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Any authenticated user (incl. carers) can view; only admin/manager can edit.
router.get('/:serviceUserId', getServicePlan);
router.put('/:serviceUserId', requirePermission('manage_service_users'), upsertServicePlan);

export default router;
