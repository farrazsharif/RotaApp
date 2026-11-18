import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  listForServiceUser,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  createAuthority,
  updateAuthority,
  deleteAuthority,
} from '../controllers/capacityController';

const router = Router();

router.use(authenticate);

// Capacity assessments are part of the care record rather than a separate
// register, so they sit behind the same capability. Every handler also checks
// the client is in the caller's scope.
router.use(requirePermission('manage_service_users'));

router.get('/:serviceUserId', listForServiceUser);
router.post('/:serviceUserId', createAssessment);
router.post('/:serviceUserId/authority', createAuthority);

router.patch('/assessment/:id', updateAssessment);
router.delete('/assessment/:id', deleteAssessment);

router.patch('/authority/:id', updateAuthority);
router.delete('/authority/:id', deleteAuthority);

export default router;
