import { Router } from 'express';
import { getCarePlan, upsertCarePlan, listCarePlans, deleteCarePlan } from '../controllers/carePlanController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserParam } from '../middleware/scope';

const router = Router();

router.use(authenticate);

// Index of which clients have a plan (site-scoped inside the controller).
router.get('/', listCarePlans);

// Param-addressed routes are site-scoped. Any authenticated user (incl. carers)
// can view; only admin/manager can write, amend, or delete.
router.get('/:serviceUserId', scopeServiceUserParam, getCarePlan);
router.put('/:serviceUserId', scopeServiceUserParam, requirePermission('manage_service_users'), upsertCarePlan);
router.delete('/:serviceUserId', scopeServiceUserParam, requirePermission('manage_service_users'), deleteCarePlan);

export default router;
