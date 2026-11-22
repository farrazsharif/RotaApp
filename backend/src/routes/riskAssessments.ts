import { Router } from 'express';
import {
  listRiskAssessments,
  getRiskAssessment,
  upsertRiskAssessment,
  recordPaperRiskAssessment,
  deleteRiskAssessment,
} from '../controllers/riskAssessmentController';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
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

// Typing up an assessment that already exists on paper. Its own capability
// and its own route, because it can only CREATE: it will not touch an
// assessment already in Caremid, so it cannot rewrite the risks a carer is
// working to. See the controller for why the paper date is compulsory.
router.post(
  '/:serviceUserId/:type/from-paper',
  scopeServiceUserParam,
  requireAnyPermission('manage_service_users', 'record_paper_risk_assessment'),
  recordPaperRiskAssessment,
);

export default router;
