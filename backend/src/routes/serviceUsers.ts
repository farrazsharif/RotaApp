import { Router } from 'express';
import {
  listServiceUsers, getServiceUser, createServiceUser, updateServiceUser, deleteServiceUser,
} from '../controllers/serviceUserController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listServiceUsers);
router.get('/:id', getServiceUser);
router.post('/', requireRole('ADMIN', 'MANAGER'), createServiceUser);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateServiceUser);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), deleteServiceUser);

export default router;
