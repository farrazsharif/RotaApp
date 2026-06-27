import { Router } from 'express';
import { hoursReport, overtimeReport, coverageReport, scheduledHoursReport, cribSheetReport, dashboardStats, shiftRoles } from '../controllers/reportController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/dashboard', dashboardStats);
router.get('/hours', requireRole('ADMIN', 'MANAGER'), hoursReport);
router.get('/overtime', requireRole('ADMIN', 'MANAGER'), overtimeReport);
router.get('/coverage', requireRole('ADMIN', 'MANAGER'), coverageReport);
router.get('/scheduled-hours', requireRole('ADMIN', 'MANAGER'), scheduledHoursReport);
router.get('/crib-sheet', requireRole('ADMIN', 'MANAGER'), cribSheetReport);
router.get('/shift-roles', requireRole('ADMIN', 'MANAGER'), shiftRoles);

export default router;
