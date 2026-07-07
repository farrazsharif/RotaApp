import { Router } from 'express';
import { createPayment, deletePayment, getAgedDebt } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/aged-debt', requirePermission('manage_billing'), getAgedDebt);
router.post('/', requirePermission('manage_billing'), createPayment);
router.delete('/:id', requirePermission('manage_billing'), deletePayment);

export default router;
