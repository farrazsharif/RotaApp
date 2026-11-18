import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runWithCompany } from '../lib/tenantContext';
import { requirePermission } from '../middleware/permissions';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  uploadPolicyAttachment,
  downloadPolicyAttachment,
  deletePolicyAttachment,
} from '../controllers/policyController';

// Re-establishes the caller's company scope around the handler. Multer parses
// the body on a stream event that runs outside the async-local context set at
// auth, so without this the policy write would be unscoped — and Express 4
// would not surface the thrown error either.
const scoped = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  const companyId = (req as AuthRequest).user?.companyId;
  const run = () => Promise.resolve(fn(req, res, next)).catch(next);
  return companyId ? runWithCompany(companyId, run) : run();
};

// Held in memory just long enough to stream to R2. 20MB covers a long policy
// exported from Word with its tables and images intact.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      return res.status(400).json({
        error: code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 20MB)' : 'Upload failed',
      });
    }
    next();
  });
}

const router = Router();

router.use(authenticate);

// The register is the office's. There is no staff-facing half: policies are
// not pushed at carers, and nobody is asked to sign one.
router.use(requirePermission('manage_policies'));

router.get('/', listPolicies);
router.post('/', createPolicy);
router.get('/:id', getPolicy);
router.patch('/:id', updatePolicy);
router.delete('/:id', deletePolicy);

router.get('/:id/attachment', downloadPolicyAttachment);
router.post('/:id/attachment', uploadSingle, scoped(uploadPolicyAttachment));
router.delete('/:id/attachment', deletePolicyAttachment);

export default router;
