import { Router } from 'express';
import { createCallLog, listCallLogs, updateCallLog, deleteCallLog } from '../controllers/callLogController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserRef, scopeRecordById } from '../middleware/scope';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);
router.use(scopeServiceUserRef);

const byCallLog = scopeRecordById((id) =>
  prisma.callLog.findUnique({ where: { id }, select: { serviceUserId: true } }).then((c) => c?.serviceUserId));

router.get('/', listCallLogs);
router.post('/', createCallLog);
router.put('/:id', byCallLog, requirePermission('edit_call_logs'), updateCallLog);
router.delete('/:id', byCallLog, requirePermission('edit_call_logs'), deleteCallLog);

export default router;
