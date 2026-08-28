import { Router } from 'express';
import {
  listPlacements, createPlacement, updatePlacement, deletePlacement,
  listMyPlacements, listPlacementLogs, upsertPlacementLog,
} from '../controllers/placementController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Carer-app endpoints — the assigned live-in carer only (checked in-controller),
// no schedule permission required. Declared before the manager routes.
router.get('/mine', listMyPlacements);
router.get('/:id/logs', listPlacementLogs);
router.put('/:id/logs/:date', upsertPlacementLog);

// Live-in placements are a scheduling tool — gated by the schedule capability.
router.get('/', requirePermission('manage_schedule'), listPlacements);
router.post('/', requirePermission('manage_schedule'), createPlacement);
router.patch('/:id', requirePermission('manage_schedule'), updatePlacement);
router.delete('/:id', requirePermission('manage_schedule'), deletePlacement);

export default router;
