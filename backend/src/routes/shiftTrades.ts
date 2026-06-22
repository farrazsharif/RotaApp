import { Router } from 'express';
import { listTrades, createTrade, respondToTrade, approveTrade, cancelTrade } from '../controllers/shiftTradeController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER'), listTrades);
router.post('/', requireRole('ADMIN', 'MANAGER'), createTrade);
router.put('/:id/respond', requireRole('ADMIN', 'MANAGER'), respondToTrade);
router.put('/:id/approve', requireRole('ADMIN', 'MANAGER'), approveTrade);
router.put('/:id/cancel', requireRole('ADMIN', 'MANAGER'), cancelTrade);

export default router;
