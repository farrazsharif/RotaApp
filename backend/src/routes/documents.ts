import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { documentConfig, listDocuments, uploadDocument, downloadDocument, deleteDocument } from '../controllers/documentController';

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
router.get('/', listDocuments);
router.post('/', uploadSingle, uploadDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

export default router;
