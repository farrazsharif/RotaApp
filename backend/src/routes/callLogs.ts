import { Router } from 'express';
import { createCallLog, listCallLogs } from '../controllers/callLogController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listCallLogs);
router.post('/', createCallLog);

export default router;
