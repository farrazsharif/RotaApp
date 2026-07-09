import { Router } from 'express';
import { listShifts, getShift, createShift, updateShift, deleteShift, bulkCreateShifts, cancelBulkShifts, assignShiftCarer, publishShift, publishBulkShifts } from '../controllers/shiftController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { broadcastOnSuccess } from '../middleware/broadcast';

const router = Router();

router.use(authenticate);

// A shift change by one manager should show up live for the others, and also
// update the dashboard's unassigned-calls count.
router.use(broadcastOnSuccess('shifts', 'dashboard-stats'));

router.get('/', listShifts);
router.get('/:id', getShift);
router.post('/', requirePermission('manage_schedule'), createShift);
router.post('/bulk', requirePermission('manage_schedule'), bulkCreateShifts);
router.post('/cancel-bulk', requirePermission('manage_schedule'), cancelBulkShifts);
router.post('/publish-bulk', requirePermission('manage_schedule'), publishBulkShifts);
router.post('/:id/publish', requirePermission('manage_schedule'), publishShift);
router.post('/:id/assign', requirePermission('manage_schedule'), assignShiftCarer);
router.put('/:id', requirePermission('manage_schedule'), updateShift);
router.delete('/:id', requirePermission('manage_schedule'), deleteShift);

export default router;
