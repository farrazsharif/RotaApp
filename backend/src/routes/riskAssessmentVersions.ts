import { Router } from 'express';
import { listRiskAssessmentVersions, getRiskAssessmentVersion, createRiskAssessmentVersion } from '../controllers/riskAssessmentVersionController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Viewing past reviews is open to any authenticated user; completing a review
// (archiving a snapshot) is a care-management action (same gate as editing).
router.get('/', listRiskAssessmentVersions);
router.get('/:id', getRiskAssessmentVersion);
router.post('/', requirePermission('manage_service_users'), createRiskAssessmentVersion);

export default router;
