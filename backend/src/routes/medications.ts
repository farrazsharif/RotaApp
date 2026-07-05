import { Router } from 'express';
import {
  listMedications, createMedication, updateMedication, deleteMedication,
  listAdministrations, recordAdministration,
} from '../controllers/medicationController';
import { authenticate, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

// Administration records (any authenticated user/carer can record)
router.get('/administrations', listAdministrations);
router.post('/administrations', recordAdministration);

// Medications (managers/admin manage the regimen)
router.get('/', listMedications);
router.post('/', requirePermission('manage_medications'), createMedication);
router.put('/:id', requirePermission('manage_medications'), updateMedication);
router.delete('/:id', requirePermission('manage_medications'), deleteMedication);

export default router;
