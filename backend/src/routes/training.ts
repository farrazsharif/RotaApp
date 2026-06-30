import { Router } from 'express';
import { listTraining, createTraining, updateTraining, deleteTraining } from '../controllers/trainingController';
import { authenticate, requireRole } from '../middleware/auth';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listTraining);
router.post('/', requireRole(Role.ADMIN, Role.MANAGER), createTraining);
router.put('/:id', requireRole(Role.ADMIN, Role.MANAGER), updateTraining);
router.delete('/:id', requireRole(Role.ADMIN, Role.MANAGER), deleteTraining);

export default router;
