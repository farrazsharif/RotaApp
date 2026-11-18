import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  listAudits,
  getAudit,
  createAudit,
  updateAudit,
  deleteAudit,
  listActions,
  createAction,
  updateAction,
  deleteAction,
} from '../controllers/governanceController';

const router = Router();

router.use(authenticate);

// Audits and the improvement plan are the CQC compliance manager's work, so
// they sit behind the capability that already means exactly that rather than
// adding another one to configure.
router.use(requirePermission('manage_cqc'));

router.get('/audits', listAudits);
router.post('/audits', createAudit);
router.get('/audits/:id', getAudit);
router.patch('/audits/:id', updateAudit);
router.delete('/audits/:id', deleteAudit);

router.get('/actions', listActions);
router.post('/actions', createAction);
router.patch('/actions/:id', updateAction);
router.delete('/actions/:id', deleteAction);

export default router;
