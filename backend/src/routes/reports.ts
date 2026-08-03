import { Router } from 'express';
import { hoursReport, overtimeReport, coverageReport, scheduledHoursReport, cribSheetReport, dashboardStats, shiftRoles, lateCheckinsList, missedMedsList, ecmReport, saveEcmNote } from '../controllers/reportController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/dashboard', dashboardStats);
router.get('/late-checkins', lateCheckinsList);
router.get('/missed-meds', missedMedsList);
router.get('/hours', requirePermission('view_reports'), hoursReport);
router.get('/overtime', requirePermission('view_reports'), overtimeReport);
router.get('/coverage', requirePermission('view_reports'), coverageReport);
router.get('/scheduled-hours', requirePermission('view_reports'), scheduledHoursReport);
router.get('/crib-sheet', requirePermission('view_reports'), cribSheetReport);
router.get('/shift-roles', requirePermission('view_reports'), shiftRoles);
router.get('/ecm', requirePermission('view_reports'), ecmReport);
router.post('/ecm-note', requirePermission('view_reports'), saveEcmNote);

export default router;
