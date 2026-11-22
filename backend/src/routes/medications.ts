import { Router } from 'express';
import {
  listMedications, createMedication, createMedicationByCarer, updateMedication, deleteMedication,
  listAdministrations, recordAdministration, recordAdministrationByManager, cancelledDoses, backfillMar,
  marExceptions, reclassifyDoses,
} from '../controllers/medicationController';
import { authenticate } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
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
// Dose slots whose visit was cancelled (for the MAR chart's "C" markers).
router.get('/cancelled-doses', cancelledDoses);
router.post('/administrations', recordAdministration);
// Office record/correction from the portal — attributes to a carer, sets the
// real time, and is audited. Managers only.
router.post('/administrations/manage', requirePermission('manage_medications'), recordAdministrationByManager);
// Fill blanks a change of recording method left behind. Adds only, and only
// where a visit was clocked into — see lib/marBackfill.ts.
router.post('/administrations/backfill', requireAnyPermission('manage_medications', 'backfill_mar'), backfillMar);
// Exceptions with the call log of the visit that owned each dose — the carer
// usually wrote what happened there, not in the dose's own note.
router.get('/mar-exceptions', marExceptions);
// Missed → in hospital / not at home, audited with the status it replaced.
router.post('/administrations/reclassify', requireAnyPermission('manage_medications', 'backfill_mar'), reclassifyDoses);

// Medications (managers/admin manage the regimen)
router.get('/', listMedications);
router.post('/', requirePermission('manage_medications'), createMedication);
// Carers may add a short-course medication directly from the app (scoped +
// audited); they cannot edit or discontinue the ongoing regimen.
router.post('/carer', createMedicationByCarer);
router.put('/:id', byMedication, requirePermission('manage_medications'), updateMedication);
router.delete('/:id', byMedication, requirePermission('manage_medications'), deleteMedication);

export default router;
