import { Router } from 'express';
import { listFunding, createFunding, updateFunding, deleteFunding } from '../controllers/fundingController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { scopeServiceUserRef, scopeRecordById } from '../middleware/scope';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);
// Guards create/list which carry serviceUserId in body/query.
router.use(scopeServiceUserRef);

const byArrangement = scopeRecordById((id) =>
  prisma.fundingArrangement.findUnique({ where: { id }, select: { serviceUserId: true } }).then((a) => a?.serviceUserId));

router.get('/', requirePermission('manage_billing'), listFunding);
router.post('/', requirePermission('manage_billing'), createFunding);
router.put('/:id', byArrangement, requirePermission('manage_billing'), updateFunding);
router.delete('/:id', byArrangement, requirePermission('manage_billing'), deleteFunding);

export default router;
