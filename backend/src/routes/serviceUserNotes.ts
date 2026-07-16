import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';
import { listServiceUserNotes, createServiceUserNote, updateServiceUserNote, deleteServiceUserNote } from '../controllers/serviceUserNoteController';

const router = Router();

router.use(authenticate);
// Office notes are for office staff — admins and managers (incl. their custom
// roles). Carers and family accounts have no access.
router.use(requireRole(Role.ADMIN, Role.MANAGER));

router.get('/', listServiceUserNotes);
router.post('/', createServiceUserNote);
router.patch('/:id', updateServiceUserNote);
router.delete('/:id', deleteServiceUserNote);

export default router;
