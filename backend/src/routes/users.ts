import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser, reactivateUser, permanentDeleteUser, resendInvite, setUserPermissions, staffComplianceSummary, staffCompliance } from '../controllers/userController';
import { adminResetPassword, impersonateUser } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listUsers);
// Compliance routes must precede '/:id' so "compliance" isn't read as an id.
router.get('/compliance', staffComplianceSummary);
router.get('/:id', getUser);
router.get('/:id/compliance', staffCompliance);
router.post('/', requirePermission('manage_staff'), createUser);
router.put('/:id', requirePermission('manage_staff'), updateUser);
router.put('/:id/permissions', requirePermission('manage_permissions'), setUserPermissions);
router.post('/:id/reset-password', requirePermission('reset_staff_passwords'), adminResetPassword);
router.post('/:id/impersonate', requirePermission('manage_staff'), impersonateUser);
router.post('/:id/resend-invite', requirePermission('manage_staff'), resendInvite);
router.delete('/:id', requirePermission('delete_staff'), deleteUser);
router.post('/:id/reactivate', requirePermission('delete_staff'), reactivateUser);
router.delete('/:id/permanent', requirePermission('delete_staff'), permanentDeleteUser);

export default router;
