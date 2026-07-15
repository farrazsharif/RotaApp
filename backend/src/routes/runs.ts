import { Router } from 'express';
import { listRuns, createRun, updateRun, deleteRun, applyRunTeam } from '../controllers/runController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Runs are a scheduling tool — all endpoints are for schedule managers.
router.get('/', requirePermission('manage_schedule'), listRuns);
router.post('/', requirePermission('manage_schedule'), createRun);
router.patch('/:id', requirePermission('manage_schedule'), updateRun);
router.delete('/:id', requirePermission('manage_schedule'), deleteRun);
router.post('/:id/apply-team', requirePermission('manage_schedule'), applyRunTeam);

export default router;
