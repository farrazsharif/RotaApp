import { Router } from 'express';
import { listFunders, createFunder, updateFunder, deleteFunder } from '../controllers/funderController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('manage_billing'), listFunders);
router.post('/', requirePermission('manage_billing'), createFunder);
router.put('/:id', requirePermission('manage_billing'), updateFunder);
router.delete('/:id', requirePermission('manage_billing'), deleteFunder);

export default router;
