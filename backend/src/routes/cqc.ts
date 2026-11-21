import { Router } from 'express';
import {
  getReadiness,
  getStatements,
  reviewStatement,
  saveSelfAssessment,
} from '../controllers/cqcController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/readiness', requirePermission('manage_cqc'), getReadiness);

// Quality statements: the same readiness data grouped by CQC statement, with
// the evidence behind each and any management review. The controller decides
// whether named client and staff records are included.
router.get('/statements', requirePermission('manage_cqc'), getStatements);
router.post('/statements/:key/review', requirePermission('manage_cqc'), reviewStatement);

// Superseded by the statement reviews above, which record who decided and
// when. Kept so an older client still saves rather than erroring, and so no
// existing self-assessment is lost.
router.put('/self-assessment', requirePermission('manage_cqc'), saveSelfAssessment);

export default router;
