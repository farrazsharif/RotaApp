import { Router } from 'express';
import { createCallLog, listCallLogs, updateCallLog, deleteCallLog } from '../controllers/callLogController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listCallLogs);
router.post('/', createCallLog);
router.put('/:id', requireRole(Role.ADMIN), updateCallLog);
router.delete('/:id', requireRole(Role.ADMIN), deleteCallLog);

export default router;
