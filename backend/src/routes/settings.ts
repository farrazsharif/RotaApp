import { Router } from 'express';
import { getOrgSettings, updateOrgSettings } from '../controllers/settingsController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Everyone can read (used for company name, staff-form defaults, etc.).
router.get('/', getOrgSettings);
// Only admins can change org-wide settings.
router.put('/', requireRole('ADMIN'), updateOrgSettings);

export default router;
