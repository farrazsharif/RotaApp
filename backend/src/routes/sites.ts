import { Router } from 'express';
import { listSites, createSite, updateSite, deleteSite } from '../controllers/siteController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listSites);
router.post('/', requireRole('ADMIN', 'MANAGER'), createSite);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateSite);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), deleteSite);

export default router;
