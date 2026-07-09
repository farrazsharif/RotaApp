import { Router } from 'express';
import { listShifts, getShift, createShift, updateShift, deleteShift, bulkCreateShifts, cancelBulkShifts, assignShiftCarer, publishShift, publishBulkShifts } from '../controllers/shiftController';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { emitToCompany } from '../lib/socket';

const router = Router();

router.use(authenticate);

// After any successful shift mutation, tell the rest of the company's open
// sessions to refetch, so a change by one manager shows up live for the others
// without a manual page refresh.
router.use((req: AuthRequest, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.companyId) {
      emitToCompany(req.user.companyId, 'shifts:changed', {});
    }
  });
  next();
});

router.get('/', listShifts);
router.get('/:id', getShift);
router.post('/', requirePermission('manage_schedule'), createShift);
router.post('/bulk', requirePermission('manage_schedule'), bulkCreateShifts);
router.post('/cancel-bulk', requirePermission('manage_schedule'), cancelBulkShifts);
router.post('/publish-bulk', requirePermission('manage_schedule'), publishBulkShifts);
router.post('/:id/publish', requirePermission('manage_schedule'), publishShift);
router.post('/:id/assign', requirePermission('manage_schedule'), assignShiftCarer);
router.put('/:id', requirePermission('manage_schedule'), updateShift);
router.delete('/:id', requirePermission('manage_schedule'), deleteShift);

export default router;
