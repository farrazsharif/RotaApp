import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';
import { listNotes, createNote, deleteNote } from '../controllers/noteController';

const router = Router();

router.use(authenticate);
// The office log is for office staff only — admins and managers (incl. their
// custom roles). Carers and family accounts have no access.
router.use(requireRole(Role.ADMIN, Role.MANAGER));

router.get('/', listNotes);
router.post('/', createNote);
router.delete('/:id', deleteNote);

export default router;
