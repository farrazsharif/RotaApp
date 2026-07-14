import { Router } from 'express';
import { getServicePlan, upsertServicePlan, listServicePlans, deleteServicePlan } from '../controllers/servicePlanController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserParam } from '../middleware/scope';

const router = Router();

router.use(authenticate);

// Index of which clients have a plan (site-scoped inside the controller).
router.get('/', listServicePlans);

// Param-addressed routes are site-scoped. Any authenticated user (incl. carers)
// can view; only admin/manager can edit or delete.
router.get('/:serviceUserId', scopeServiceUserParam, getServicePlan);
router.put('/:serviceUserId', scopeServiceUserParam, requirePermission('manage_service_users'), upsertServicePlan);
router.delete('/:serviceUserId', scopeServiceUserParam, requirePermission('manage_service_users'), deleteServicePlan);

export default router;
