import { Router } from 'express';
import { listImportantDates, createImportantDate, updateImportantDate, deleteImportantDate } from '../controllers/importantDateController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listImportantDates);
router.post('/', requirePermission('manage_staff'), createImportantDate);
router.put('/:id', requirePermission('manage_staff'), updateImportantDate);
router.delete('/:id', requirePermission('manage_staff'), deleteImportantDate);

export default router;
