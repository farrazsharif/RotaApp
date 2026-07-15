import { Router } from 'express';
import { getServicePlanTemplate, saveServicePlanTemplate, resetServicePlanTemplate } from '../controllers/servicePlanTemplateController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Any authenticated user can read the template (needed to render a plan).
router.get('/', getServicePlanTemplate);
// Editing the question set is an org-level admin action.
router.put('/', requirePermission('manage_settings'), saveServicePlanTemplate);
router.delete('/', requirePermission('manage_settings'), resetServicePlanTemplate);

export default router;
