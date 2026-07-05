import { Router } from 'express';
import { listTimeOff, createTimeOff, updateTimeOff, deleteTimeOff } from '../controllers/timeOffController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('manage_time_off'), listTimeOff);
router.post('/', requirePermission('manage_time_off'), createTimeOff);
router.put('/:id', requirePermission('manage_time_off'), updateTimeOff);
router.delete('/:id', requirePermission('manage_time_off'), deleteTimeOff);

export default router;
