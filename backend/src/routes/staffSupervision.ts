import { Router } from 'express';
import { listSupervisions, getSupervision, createSupervision, updateSupervision, deleteSupervision } from '../controllers/staffSupervisionController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listSupervisions);
router.get('/:id', getSupervision);
router.post('/', requirePermission('manage_supervision'), createSupervision);
router.put('/:id', requirePermission('manage_supervision'), updateSupervision);
router.delete('/:id', requirePermission('manage_supervision'), deleteSupervision);

export default router;
