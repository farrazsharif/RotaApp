import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runWithCompany } from '../lib/tenantContext';
import { documentConfig, listDocuments, uploadDocument, downloadDocument, deleteDocument } from '../controllers/documentController';

// Runs a handler inside the caller's company (tenant) scope and forwards any
// async rejection to the error handler. Re-establishing the scope matters for
// the upload route: multer parses the body on a stream event that runs outside
// the async-local tenant context set at auth, which would otherwise leave the
// document write unscoped (and Express 4 wouldn't surface the thrown error).
const scoped = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  const companyId = (req as AuthRequest).user?.companyId;
  const run = () => Promise.resolve(fn(req, res, next)).catch(next);
  return companyId ? runWithCompany(companyId, run) : run();
};

// Files are held in memory just long enough to stream to R2. 20MB covers
// scanned certificates and multi-page PDFs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Wrap multer so a too-large file returns a clean 400 instead of a 500.
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      const msg = code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 20MB)' : 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

const router = Router();

router.use(authenticate);

router.get('/config', documentConfig);
router.get('/', scoped(listDocuments));
router.post('/', uploadSingle, scoped(uploadDocument));
router.get('/:id/download', scoped(downloadDocument));
router.delete('/:id', scoped(deleteDocument));

export default router;
