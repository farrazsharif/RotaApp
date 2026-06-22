import { Router } from 'express';
import { listTimeOff, createTimeOff, updateTimeOff, deleteTimeOff } from '../controllers/timeOffController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER'), listTimeOff);
router.post('/', requireRole('ADMIN', 'MANAGER'), createTimeOff);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateTimeOff);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), deleteTimeOff);

export default router;
