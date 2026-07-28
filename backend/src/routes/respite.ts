import { Router } from 'express';
import { listRespite, createRespite, updateRespite, deleteRespite } from '../controllers/respiteController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listRespite);
router.post('/', requirePermission('manage_service_users'), createRespite);
router.patch('/:id', requirePermission('manage_service_users'), updateRespite);
router.delete('/:id', requirePermission('manage_service_users'), deleteRespite);

export default router;
