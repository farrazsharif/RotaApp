import { Router } from 'express';
import { authenticate, requirePlatformAdmin } from '../middleware/auth';
import {
  listCompanies, setCompanyActive, extendTrial, endTrial, compSubscription,
} from '../controllers/platformController';

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get('/companies', listCompanies);
router.post('/companies/:id/active', setCompanyActive);
router.post('/companies/:id/extend-trial', extendTrial);
router.post('/companies/:id/end-trial', endTrial);
router.post('/companies/:id/comp', compSubscription);

export default router;
