import { Router } from 'express';
import { resetTestData } from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.delete('/reset-test-data', requirePermission('reset_test_data'), resetTestData);

export default router;
