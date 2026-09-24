import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runWithCompany } from '../lib/tenantContext';
import { requirePermission } from '../middleware/permissions';
import { listTransactions, createTransaction, uploadReceipt, getReceipt, deleteTransaction } from '../controllers/financeController';

// Re-establish tenant scope for the multipart route: multer parses the body on a
// stream event that runs outside the async-local tenant context set at auth,
// which would otherwise leave the receipt write unscoped. (Same pattern as the
// documents route.)
const scoped = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  const companyId = (req as AuthRequest).user?.companyId;
  const run = () => Promise.resolve(fn(req, res, next)).catch(next);
  return companyId ? runWithCompany(companyId, run) : run();
};

// Receipt photos held in memory just long enough to stream to R2.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      const msg = code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15MB)' : 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const router = Router();

router.use(authenticate);

router.get('/', listTransactions);
router.post('/', createTransaction);
router.post('/:id/receipt', uploadSingle, scoped(uploadReceipt));
router.get('/:id/receipt', getReceipt);
// Office correction only.
router.delete('/:id', requirePermission('manage_service_users'), deleteTransaction);

export default router;
