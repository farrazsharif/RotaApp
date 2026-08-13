import { Router } from 'express';
import {
  listRiskAssessments,
  getRiskAssessment,
  upsertRiskAssessment,
  deleteRiskAssessment,
} from '../controllers/riskAssessmentController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserParam } from '../middleware/scope';

const router = Router();

router.use(authenticate);

// Index (optionally filtered by ?serviceUserId=…), site-scoped in the controller.
router.get('/', listRiskAssessments);

// Param-addressed by client + assessment type. Any authenticated user (incl.
// carers) can view; only admin/manager can edit or delete.
router.get('/:serviceUserId/:type', scopeServiceUserParam, getRiskAssessment);
router.put('/:serviceUserId/:type', scopeServiceUserParam, requirePermission('manage_service_users'), upsertRiskAssessment);
router.delete('/:serviceUserId/:type', scopeServiceUserParam, requirePermission('manage_service_users'), deleteRiskAssessment);

export default router;
