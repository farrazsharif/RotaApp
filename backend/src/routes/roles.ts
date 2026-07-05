import { Router } from 'express';
import { listRoles, createRole, updateRole, deleteRole } from '../controllers/roleController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Readable by any authenticated user (staff form dropdown, badges).
router.get('/', listRoles);
router.post('/', requirePermission('manage_permissions'), createRole);
router.put('/:id', requirePermission('manage_permissions'), updateRole);
router.delete('/:id', requirePermission('manage_permissions'), deleteRole);

export default router;
