import { Router } from 'express';
import { listFamilyLinks, createFamilyLink, deleteFamilyLink } from '../controllers/familyLinkController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);
router.use(requireRole(Role.ADMIN, Role.MANAGER));

router.get('/', listFamilyLinks);
router.post('/', createFamilyLink);
router.delete('/:id', deleteFamilyLink);

export default router;
