import { Router } from 'express';
import { clockIn, clockOut, getClockStatus, listClockRecords, listActiveClockRecords, updateClockRecord, myCalls, dueMeds } from '../controllers/clockController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/my-calls', myCalls);
router.get('/due-meds', dueMeds);
router.post('/in', clockIn);
router.post('/out', clockOut);
router.get('/status', getClockStatus);
router.get('/active', requireRole('ADMIN', 'MANAGER'), listActiveClockRecords);
router.get('/records', listClockRecords);
router.put('/records/:id', requireRole('ADMIN', 'MANAGER'), updateClockRecord);

export default router;
