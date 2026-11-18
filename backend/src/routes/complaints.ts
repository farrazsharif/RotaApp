import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  listComplaints,
  getComplaint,
  createComplaint,
  updateComplaint,
} from '../controllers/complaintsController';

const router = Router();

router.use(authenticate);

// Anyone can log one. A carer told something on a doorstep has to be able to
// record it there and then — a complaint that waits for a manager to be free
// is a complaint that arrives as hearsay, days late, if at all.
router.post('/', createComplaint);

// Reading, investigating and responding are the office's.
router.get('/', requirePermission('manage_complaints'), listComplaints);
router.get('/:id', requirePermission('manage_complaints'), getComplaint);
router.patch('/:id', requirePermission('manage_complaints'), updateComplaint);

// Deliberately no DELETE. CQC can ask for a summary of every complaint
// received; one logged in error is closed with an outcome saying so.

export default router;
