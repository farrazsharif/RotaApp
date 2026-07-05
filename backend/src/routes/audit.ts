import { Router } from 'express';
import { listAudit } from '../controllers/auditController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);
router.get('/', requirePermission('view_audit_log'), listAudit);

export default router;
