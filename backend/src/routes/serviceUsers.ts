import { Router } from 'express';
import {
  listServiceUsers, getServiceUser, createServiceUser, updateServiceUser, deleteServiceUser,
} from '../controllers/serviceUserController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { broadcastOnSuccess } from '../middleware/broadcast';

const router = Router();

router.use(authenticate);

// Editing a service user (incl. a status change) updates the service-user list
// and the schedule badges/dashboard for everyone in the company.
router.use(broadcastOnSuccess('service-users', 'shifts', 'dashboard-stats'));

router.get('/', listServiceUsers);
router.get('/:id', getServiceUser);
router.post('/', requirePermission('manage_service_users'), createServiceUser);
router.put('/:id', requirePermission('manage_service_users'), updateServiceUser);
router.delete('/:id', requirePermission('manage_service_users'), deleteServiceUser);

export default router;
