import { Router } from 'express';
import { listAnnouncements, listAllAnnouncements, createAnnouncement, deleteAnnouncement } from '../controllers/announcementController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Carer view: broadcasts + messages addressed to me.
router.get('/', listAnnouncements);

// Manager view + posting (schedule managers communicate with carers).
router.get('/all', requirePermission('manage_schedule'), listAllAnnouncements);
router.post('/', requirePermission('manage_schedule'), createAnnouncement);
router.delete('/:id', requirePermission('manage_schedule'), deleteAnnouncement);

export default router;
