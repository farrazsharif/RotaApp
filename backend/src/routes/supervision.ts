import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { supervisionSummary, listSpotChecks, getSpotCheck, createSpotCheck, updateSpotCheck, deleteSpotCheck } from '../controllers/supervisionController';

const router = Router();

router.use(authenticate);
router.use(requirePermission('manage_supervision'));

router.get('/summary', supervisionSummary);
router.get('/spot-checks', listSpotChecks);
router.get('/spot-checks/:id', getSpotCheck);
router.post('/spot-checks', createSpotCheck);
router.put('/spot-checks/:id', updateSpotCheck);
router.delete('/spot-checks/:id', deleteSpotCheck);

export default router;
