import { Router } from 'express';
import {
  listServiceUsers, getServiceUser, getServiceUsersCompliance, createServiceUser, updateServiceUser,
  updateServiceUserSafetyInfo, deleteServiceUser,
} from '../controllers/serviceUserController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listServiceUsers);
// Before '/:id' so "compliance" isn't captured as an id.
router.get('/compliance', getServiceUsersCompliance);
router.get('/:id', getServiceUser);
router.post('/', requirePermission('manage_service_users'), createServiceUser);
router.put('/:id', requirePermission('manage_service_users'), updateServiceUser);
// Allergies and resuscitation status only. Its own route so the narrow
// capability cannot reach anything else on the record.
router.patch('/:id/safety-info', requireAnyPermission('manage_service_users', 'record_client_safety_info'), updateServiceUserSafetyInfo);
router.delete('/:id', requirePermission('manage_service_users'), deleteServiceUser);

export default router;
