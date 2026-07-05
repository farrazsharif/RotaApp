import { Router } from 'express';
import { listFamilyLinks, createFamilyLink, deleteFamilyLink } from '../controllers/familyLinkController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);
router.use(requirePermission('manage_family_access'));

router.get('/', listFamilyLinks);
router.post('/', createFamilyLink);
router.delete('/:id', deleteFamilyLink);

export default router;
