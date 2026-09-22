import { Router } from 'express';
import { listAudit, undoAuditEntry } from '../controllers/auditController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);
router.get('/', requirePermission('view_audit_log'), listAudit);
// Reversing a delete re-creates visits, so guard it with the same permission that
// deleting them needs — any manager with it can undo, not just the original actor.
router.post('/:id/undo', requirePermission('manage_schedule'), undoAuditEntry);

export default router;
