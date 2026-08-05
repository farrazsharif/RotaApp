import { Router } from 'express';
import { clockIn, clockOut, getClockStatus, listClockRecords, listActiveClockRecords, updateClockRecord, createClockRecord, setClockTimes, myCalls, dueMeds } from '../controllers/clockController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/my-calls', myCalls);
router.get('/due-meds', dueMeds);
router.post('/in', clockIn);
router.post('/out', clockOut);
router.get('/status', getClockStatus);
router.get('/active', requirePermission('manage_schedule'), listActiveClockRecords);
router.get('/records', listClockRecords);
// Office backfill of a missed visit's clock in/out (carer had no signal).
router.post('/records', requirePermission('manage_schedule'), createClockRecord);
// Carer corrects the actual start/end time on their own record (forgot to
// clock in/out). /start kept for the previously-deployed app build.
router.post('/records/:id/times', setClockTimes);
router.post('/records/:id/start', setClockTimes);
router.put('/records/:id', requirePermission('manage_schedule'), updateClockRecord);

export default router;
