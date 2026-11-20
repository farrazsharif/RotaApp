import { Router } from 'express';
import { listSupervisions, getSupervision, createSupervision, updateSupervision, deleteSupervision } from '../controllers/staffSupervisionController';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listSupervisions);
router.get('/:id', getSupervision);
// Either capability opens this route; createSupervision then decides what the
// caller may actually create. `record_paper_supervision` alone can only
// backdate a paper supervision, and only with the signed form on file.
router.post('/', requireAnyPermission('manage_supervision', 'record_paper_supervision'), createSupervision);
router.put('/:id', requirePermission('manage_supervision'), updateSupervision);
router.delete('/:id', requirePermission('manage_supervision'), deleteSupervision);

export default router;
