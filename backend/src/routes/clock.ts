import { Router } from 'express';
import { clockIn, clockOut, getClockStatus, listClockRecords, listActiveClockRecords, updateClockRecord, myCalls, dueMeds } from '../controllers/clockController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { broadcastOnSuccess } from '../middleware/broadcast';

const router = Router();

router.use(authenticate);

// Clocking in/out (incl. from the carer app) updates the managers' Attendance
// screen and the dashboard's live-on-shift count and stats.
router.use(broadcastOnSuccess('clock-records', 'clock-active', 'dashboard-stats'));

router.get('/my-calls', myCalls);
router.get('/due-meds', dueMeds);
router.post('/in', clockIn);
router.post('/out', clockOut);
router.get('/status', getClockStatus);
router.get('/active', requirePermission('manage_schedule'), listActiveClockRecords);
router.get('/records', listClockRecords);
router.put('/records/:id', requirePermission('manage_schedule'), updateClockRecord);

export default router;
