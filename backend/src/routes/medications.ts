import { Router } from 'express';
import {
  listMedications, createMedication, updateMedication, deleteMedication,
  listAdministrations, recordAdministration,
} from '../controllers/medicationController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Administration records (any authenticated user/carer can record)
router.get('/administrations', listAdministrations);
router.post('/administrations', recordAdministration);

// Medications (managers/admin manage the regimen)
router.get('/', listMedications);
router.post('/', requireRole('ADMIN', 'MANAGER'), createMedication);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateMedication);
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), deleteMedication);

export default router;
