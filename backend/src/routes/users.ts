import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser, permanentDeleteUser, resendInvite } from '../controllers/userController';
import { adminResetPassword } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', listUsers);
router.get('/:id', getUser);
router.post('/', requirePermission('manage_staff'), createUser);
router.put('/:id', requirePermission('manage_staff'), updateUser);
router.post('/:id/reset-password', requirePermission('reset_staff_passwords'), adminResetPassword);
router.post('/:id/resend-invite', requirePermission('manage_staff'), resendInvite);
router.delete('/:id', requirePermission('delete_staff'), deleteUser);
router.delete('/:id/permanent', requirePermission('delete_staff'), permanentDeleteUser);

export default router;
