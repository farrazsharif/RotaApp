import { Router } from 'express';
import {
  eligibleCarers, requestHandover, myHandovers, respondHandover, cancelHandover,
  listHandovers, revertHandover,
} from '../controllers/handoverController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Carer-facing: request a cover, see mine, respond, cancel.
router.get('/eligible', eligibleCarers);
router.get('/mine', myHandovers);
router.post('/', requestHandover);
router.post('/:id/respond', respondHandover);
router.post('/:id/cancel', cancelHandover);

// Manager review + revert.
router.get('/', requirePermission('manage_schedule'), listHandovers);
router.post('/:id/revert', requirePermission('manage_schedule'), revertHandover);

export default router;
