import { Router } from 'express';
import {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  deleteIncident,
} from '../controllers/incidentController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

// Carers can report, and read back what they reported — the controller limits
// a carer's list to their own and refuses anyone else's record.
router.get('/', listIncidents);
router.post('/', createIncident);
router.get('/:id', getIncident);

// The investigation and the status are the office's.
router.patch('/:id', requirePermission('manage_service_users'), updateIncident);

// An incident record is evidence. Removing one is for a report filed in error,
// so it is admin-only and audited rather than sitting next to "close".
router.delete('/:id', requireRole(Role.ADMIN), deleteIncident);

export default router;
