import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { documentConfig, listDocuments, uploadDocument, downloadDocument, deleteDocument } from '../controllers/documentController';

// Express 4 doesn't forward errors thrown from an async handler, which would
// leave the request hanging (e.g. if an R2 call fails). This forwards any
// rejection to the error handler so the client always gets a response.
const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

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
router.get('/', wrap(listDocuments));
router.post('/', uploadSingle, wrap(uploadDocument));
router.get('/:id/download', wrap(downloadDocument));
router.delete('/:id', wrap(deleteDocument));

export default router;
