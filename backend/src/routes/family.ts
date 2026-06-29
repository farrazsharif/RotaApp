import { Router } from 'express';
import {
  listMyServiceUsers, getServiceUser, getCarePlan, listCallLogs, listMedications, listAdministrations,
} from '../controllers/familyController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);
router.use(requireRole(Role.FAMILY_MEMBER, Role.ADMIN));

router.get('/service-users', listMyServiceUsers);
router.get('/service-users/:serviceUserId', getServiceUser);
router.get('/care-plans/:serviceUserId', getCarePlan);
router.get('/call-logs/:serviceUserId', listCallLogs);
router.get('/medications/:serviceUserId', listMedications);
router.get('/administrations/:serviceUserId', listAdministrations);

export default router;
