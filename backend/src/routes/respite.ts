import { Router } from 'express';
import { listRespite, createRespite, deleteRespite } from '../controllers/respiteController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listRespite);
router.post('/', requirePermission('manage_service_users'), createRespite);
router.delete('/:id', requirePermission('manage_service_users'), deleteRespite);

export default router;
