import { Router } from 'express';
import { lookupAddresses } from '../controllers/addressController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/lookup', lookupAddresses);

export default router;
