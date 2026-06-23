import { Router } from 'express';
import { resetTestData } from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.delete('/reset-test-data', requireRole('ADMIN'), resetTestData);

export default router;
