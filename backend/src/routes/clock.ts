import { Router } from 'express';
import { clockIn, clockOut, getClockStatus, listClockRecords, listActiveClockRecords, updateClockRecord, setClockStart, myCalls, dueMeds } from '../controllers/clockController';
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
// Carer sets the actual start time on their own record (forgot-to-clock-in fix).
router.post('/records/:id/start', setClockStart);
router.put('/records/:id', requirePermission('manage_schedule'), updateClockRecord);

export default router;
