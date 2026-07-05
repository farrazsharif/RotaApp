import { Router } from 'express';
import { getOrgSettings, updateOrgSettings, getPermissions, updatePermissions } from '../controllers/settingsController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Everyone can read (used for company name, staff-form defaults, UI gating).
router.get('/', getOrgSettings);
router.get('/permissions', getPermissions);
// Only those with the right capability can change org-wide config.
router.put('/', requirePermission('manage_settings'), updateOrgSettings);
router.put('/permissions', requirePermission('manage_permissions'), updatePermissions);

export default router;
