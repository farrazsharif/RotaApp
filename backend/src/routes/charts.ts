import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';
import {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getDay,
} from '../controllers/careChartController';

const router = Router();

router.use(authenticate);

// Carers write these and carers read them back — a repositioning chart is no
// use if the next carer cannot see when the last turn was. Every handler
// checks the client is in the caller's scope, which is what stops a carer
// seeing someone they do not visit.
router.get('/:serviceUserId/day', getDay);
router.get('/:serviceUserId', listEntries);
router.post('/:serviceUserId', createEntry);

// A carer may correct their own entry within the window; the controller
// enforces that and lets the office correct any of them.
router.patch('/entry/:id', updateEntry);

// Deleting is the office's, and audited. A chart entry is a care record, so
// this is for one logged against the wrong person rather than a tidy-up.
router.delete('/entry/:id', requireRole(Role.ADMIN, Role.MANAGER), deleteEntry);

export default router;
