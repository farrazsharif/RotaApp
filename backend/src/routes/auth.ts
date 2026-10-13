import { Router } from 'express';
import { login, getMe, updateMe, changePassword, checkSetPasswordToken, setPassword, forgotPassword } from '../controllers/authController';
import { signup } from '../controllers/signupController';
import { authenticate } from '../middleware/auth';
import { loginLimiter, authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/signup', authLimiter, signup);
router.post('/login', loginLimiter, login);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.put('/change-password', authenticate, changePassword);
router.get('/set-password/:token', checkSetPasswordToken);
router.post('/set-password', authLimiter, setPassword);
router.post('/forgot-password', authLimiter, forgotPassword);

export default router;
