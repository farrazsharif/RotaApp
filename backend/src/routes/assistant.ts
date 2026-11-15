import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { assistantChat, assistantStatus } from '../controllers/assistantController';

const router = Router();

router.use(authenticate);

// Lets the UI hide the assistant entirely when no API key is configured,
// rather than offering a button that always fails.
router.get('/status', assistantStatus);
router.post('/chat', assistantChat);

export default router;
