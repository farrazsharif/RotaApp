import { Router } from 'express';
import { listBankHolidays, createBankHoliday, deleteBankHoliday } from '../controllers/bankHolidayController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('manage_billing'), listBankHolidays);
router.post('/', requirePermission('manage_billing'), createBankHoliday);
router.delete('/:id', requirePermission('manage_billing'), deleteBankHoliday);

export default router;
