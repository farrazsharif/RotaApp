import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser, permanentDeleteUser, resendInvite } from '../controllers/userController';
import { adminResetPassword } from '../controllers/authController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', listUsers);
router.get('/:id', getUser);
router.post('/', requireRole('ADMIN', 'MANAGER'), createUser);
router.put('/:id', requireRole('ADMIN', 'MANAGER'), updateUser);
router.post('/:id/reset-password', requireRole('ADMIN'), adminResetPassword);
router.post('/:id/resend-invite', requireRole('ADMIN', 'MANAGER'), resendInvite);
router.delete('/:id', requireRole('ADMIN'), deleteUser);
router.delete('/:id/permanent', requireRole('ADMIN'), permanentDeleteUser);

export default router;
