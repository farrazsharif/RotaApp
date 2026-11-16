import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  listConcerns,
  getConcern,
  createConcern,
  updateConcern,
} from '../controllers/safeguardingController';

const router = Router();

router.use(authenticate);

// Anyone can raise one. A carer who notices something at 7am must be able to
// record it there and then — putting the log behind a manager capability is
// how concerns end up as a text message to the office instead.
router.post('/', createConcern);

// Reading, investigating and closing are the office's.
router.get('/', requirePermission('manage_safeguarding'), listConcerns);
router.get('/:id', requirePermission('manage_safeguarding'), getConcern);
router.patch('/:id', requirePermission('manage_safeguarding'), updateConcern);

// Deliberately no DELETE. A safeguarding record is evidence: a concern raised
// in error is closed with an outcome saying so, not removed.

export default router;
