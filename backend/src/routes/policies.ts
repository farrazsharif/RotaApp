import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  listPolicies,
  myPolicies,
  myPolicy,
  getPolicy,
  createPolicy,
  updatePolicy,
  signPolicy,
  deletePolicy,
} from '../controllers/policyController';

const router = Router();

router.use(authenticate);

// Everyone reads and signs their own. A policy library nobody outside the
// office can open is a filing cabinet, not a governance record — and the
// signature is the half an inspector asks for.
router.get('/mine', myPolicies);
router.get('/mine/:id', myPolicy);
router.post('/:id/sign', signPolicy);

// Writing the library is the office's.
router.get('/', requirePermission('manage_policies'), listPolicies);
router.get('/:id', requirePermission('manage_policies'), getPolicy);
router.post('/', requirePermission('manage_policies'), createPolicy);
router.patch('/:id', requirePermission('manage_policies'), updatePolicy);
router.delete('/:id', requirePermission('manage_policies'), deletePolicy);

export default router;
