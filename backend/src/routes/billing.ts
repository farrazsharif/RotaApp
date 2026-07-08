import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getBillingStatus, createCheckoutSession, createPortalSession } from '../controllers/billingController';

const router = Router();

router.use(authenticate);

// Any signed-in user can see the billing status (so the app can show a paywall);
// only settings managers can start checkout or open the portal.
router.get('/status', getBillingStatus);
router.post('/checkout', requirePermission('manage_settings'), createCheckoutSession);
router.post('/portal', requirePermission('manage_settings'), createPortalSession);

export default router;
