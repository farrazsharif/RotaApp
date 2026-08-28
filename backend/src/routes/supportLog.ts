import { Router } from 'express';
import { listSupportLog, createSupportLogEntry } from '../controllers/supportLogController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Any authenticated user can read a client's support log; write access is
// checked in the controller (assigned carer, or a manager/admin).
router.get('/', listSupportLog);
router.post('/', createSupportLogEntry);

export default router;
