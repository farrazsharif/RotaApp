import { Router } from 'express';
import {
  listServiceUsers, getServiceUser, getServiceUsersCompliance, createServiceUser, updateServiceUser, deleteServiceUser,
} from '../controllers/serviceUserController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listServiceUsers);
// Before '/:id' so "compliance" isn't captured as an id.
router.get('/compliance', getServiceUsersCompliance);
router.get('/:id', getServiceUser);
router.post('/', requirePermission('manage_service_users'), createServiceUser);
router.put('/:id', requirePermission('manage_service_users'), updateServiceUser);
router.delete('/:id', requirePermission('manage_service_users'), deleteServiceUser);

export default router;
