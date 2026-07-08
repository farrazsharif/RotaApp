import { Router } from 'express';
import { login, getMe, updateMe, changePassword, checkSetPasswordToken, setPassword } from '../controllers/authController';
import { signup } from '../controllers/signupController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.put('/change-password', authenticate, changePassword);
router.get('/set-password/:token', checkSetPasswordToken);
router.post('/set-password', setPassword);

export default router;
