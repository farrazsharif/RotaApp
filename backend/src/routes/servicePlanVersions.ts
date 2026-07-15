import { Router } from 'express';
import { listServicePlanVersions, getServicePlanVersion, createServicePlanVersion } from '../controllers/servicePlanVersionController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Viewing the audit trail is open to any authenticated user; creating a signed
// version is a care-management action (same gate as editing the plan).
router.get('/', listServicePlanVersions);
router.get('/:id', getServicePlanVersion);
router.post('/', requirePermission('manage_service_users'), createServicePlanVersion);

export default router;
