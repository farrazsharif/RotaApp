import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/pushController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/vapid-key', getVapidKey);
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);

export default router;
