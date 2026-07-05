import { Router } from 'express';
import { hoursReport, overtimeReport, coverageReport, scheduledHoursReport, cribSheetReport, dashboardStats, shiftRoles } from '../controllers/reportController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/dashboard', dashboardStats);
router.get('/hours', requirePermission('view_reports'), hoursReport);
router.get('/overtime', requirePermission('view_reports'), overtimeReport);
router.get('/coverage', requirePermission('view_reports'), coverageReport);
router.get('/scheduled-hours', requirePermission('view_reports'), scheduledHoursReport);
router.get('/crib-sheet', requirePermission('view_reports'), cribSheetReport);
router.get('/shift-roles', requirePermission('view_reports'), shiftRoles);

export default router;
