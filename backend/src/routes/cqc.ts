import { Router } from 'express';
import { getReadiness, saveSelfAssessment } from '../controllers/cqcController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/readiness', requirePermission('manage_cqc'), getReadiness);
router.put('/self-assessment', requirePermission('manage_cqc'), saveSelfAssessment);

export default router;
