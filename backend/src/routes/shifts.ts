import { Router } from 'express';
import { listShifts, getShift, createShift, updateShift, deleteShift, bulkCreateShifts, cancelBulkShifts, assignShiftCarer, publishShift, publishBulkShifts } from '../controllers/shiftController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listShifts);
router.get('/:id', getShift);
router.post('/', requireRole('ADMIN', 'MANAGER'), createShift);
router.post('/bulk', requireRole('ADMIN', 'MANAGER'), bulkCreateShifts);
router.post('/cancel-bulk', requireRole('ADMIN', 'MANAGER'), cancelBulkShifts);
router.post('/publish-bulk', requireRole('ADMIN', 'MANAGER'), publishBulkShifts);
router.post('/:id/publish', requireRole('ADMIN', 'MANAGER'), publishShift);
router.post('/:id/assign', requireRole('ADMIN', 'MANAGER'), assignShiftCarer);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateShift);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), deleteShift);

export default router;
