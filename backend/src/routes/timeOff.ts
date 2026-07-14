import { Router } from 'express';
import { listTimeOff, createTimeOff, updateTimeOff, deleteTimeOff } from '../controllers/timeOffController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Any carer can view and apply for their own time off (the controller scopes
// EMPLOYEE callers to their own requests and creates against their own id).
// Deleting is limited to the owner's own pending requests in the controller.
router.get('/', listTimeOff);
router.post('/', createTimeOff);
router.delete('/:id', deleteTimeOff);
// Approving / rejecting stays manager-only.
router.put('/:id', requirePermission('manage_time_off'), updateTimeOff);

export default router;
