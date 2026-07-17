import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { resetTestData, dbHealth } from '../controllers/adminController';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.delete('/reset-test-data', requirePermission('reset_test_data'), resetTestData);

// Temporary diagnostic — any admin, plus a shared key, so it can't be hit by
// guessing the path alone. Remove once the shift-performance issue is resolved.
const diagKey = (req: AuthRequest, res: Response, next: NextFunction) =>
  req.query.key === 'shiftdiag2026' ? next() : res.status(404).json({ error: 'Not found' });
router.get('/db-health', requireRole(Role.ADMIN), diagKey, dbHealth);

export default router;
