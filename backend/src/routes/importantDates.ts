import { Router } from 'express';
import { listImportantDates, createImportantDate, updateImportantDate, deleteImportantDate } from '../controllers/importantDateController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listImportantDates);
router.post('/', requireRole(Role.ADMIN, Role.MANAGER), createImportantDate);
router.put('/:id', requireRole(Role.ADMIN, Role.MANAGER), updateImportantDate);
router.delete('/:id', requireRole(Role.ADMIN, Role.MANAGER), deleteImportantDate);

export default router;
