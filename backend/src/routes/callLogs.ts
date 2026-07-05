import { Router } from 'express';
import { createCallLog, listCallLogs, updateCallLog, deleteCallLog } from '../controllers/callLogController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listCallLogs);
router.post('/', createCallLog);
router.put('/:id', requirePermission('edit_call_logs'), updateCallLog);
router.delete('/:id', requirePermission('edit_call_logs'), deleteCallLog);

export default router;
