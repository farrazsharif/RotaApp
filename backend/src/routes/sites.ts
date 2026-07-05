import { Router } from 'express';
import { listSites, createSite, updateSite, deleteSite } from '../controllers/siteController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listSites);
router.post('/', requirePermission('manage_sites'), createSite);
router.put('/:id', requirePermission('manage_sites'), updateSite);
router.delete('/:id', requirePermission('manage_sites'), deleteSite);

export default router;
