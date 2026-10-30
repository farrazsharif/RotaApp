import { Router } from 'express';
import { listShifts, countShifts, getShift, createShift, updateShift, deleteShift, bulkCreateShifts, cancelBulkShifts, assignShiftCarer, restoreShiftAssignments, publishShift, publishBulkShifts, extendSeries } from '../controllers/shiftController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listShifts);
// Must precede '/:id' or "count" would be captured as a shift id.
router.get('/count', countShifts);
router.get('/:id', getShift);
router.post('/', requirePermission('manage_schedule'), createShift);
router.post('/bulk', requirePermission('manage_schedule'), bulkCreateShifts);
router.post('/cancel-bulk', requirePermission('manage_schedule'), cancelBulkShifts);
router.post('/publish-bulk', requirePermission('manage_schedule'), publishBulkShifts);
router.post('/:id/publish', requirePermission('manage_schedule'), publishShift);
router.post('/:id/assign', requirePermission('manage_schedule'), assignShiftCarer);
// Lengthen a recurring visit - continues the pattern of the visits already on
// the schedule, up to a new end date.
router.post('/:id/extend-series', requirePermission('manage_schedule'), extendSeries);
router.post('/restore-assignments', requirePermission('manage_schedule'), restoreShiftAssignments);
router.put('/:id', requirePermission('manage_schedule'), updateShift);
router.delete('/:id', requirePermission('manage_schedule'), deleteShift);

export default router;
