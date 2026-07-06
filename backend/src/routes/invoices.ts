import { Router } from 'express';
import { listInvoices, getInvoice, generateInvoice, updateInvoice, deleteInvoice } from '../controllers/invoiceController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);
router.use(requirePermission('manage_billing'));

router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', generateInvoice);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

export default router;
