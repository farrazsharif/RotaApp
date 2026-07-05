import { Router } from 'express';
import { listTraining, createTraining, updateTraining, deleteTraining } from '../controllers/trainingController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { Role } from '../constants';

const router = Router();

router.use(authenticate);

router.get('/', listTraining);
router.post('/', requirePermission('manage_staff'), createTraining);
router.put('/:id', requirePermission('manage_staff'), updateTraining);
router.delete('/:id', requirePermission('manage_staff'), deleteTraining);

export default router;
