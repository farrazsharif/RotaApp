import { Router } from 'express';
import {
  listMedications, createMedication, updateMedication, deleteMedication,
  listAdministrations, recordAdministration,
} from '../controllers/medicationController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserRef, scopeRecordById } from '../middleware/scope';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);
// Guards anything carrying serviceUserId in body/query (create, list, admin).
router.use(scopeServiceUserRef);

const byMedication = scopeRecordById((id) =>
  prisma.medication.findUnique({ where: { id }, select: { serviceUserId: true } }).then((m) => m?.serviceUserId));

// Administration records (any authenticated user/carer can record)
router.get('/administrations', listAdministrations);
router.post('/administrations', recordAdministration);

// Medications (managers/admin manage the regimen)
router.get('/', listMedications);
router.post('/', requirePermission('manage_medications'), createMedication);
router.put('/:id', byMedication, requirePermission('manage_medications'), updateMedication);
router.delete('/:id', byMedication, requirePermission('manage_medications'), deleteMedication);

export default router;
