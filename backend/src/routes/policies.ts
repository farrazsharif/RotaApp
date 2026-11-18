import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { runWithCompany } from '../lib/tenantContext';
import { requirePermission } from '../middleware/permissions';
import {
  listPolicies,
  myPolicies,
  myPolicy,
  getPolicy,
  createPolicy,
  updatePolicy,
  signPolicy,
  deletePolicy,
  uploadPolicyAttachment,
  downloadPolicyAttachment,
  downloadMyPolicyAttachment,
  deletePolicyAttachment,
} from '../controllers/policyController';

// Re-establishes the caller's company scope around the handler. Multer parses
// the body on a stream event that runs outside the async-local context set at
// auth, so without this the policy update would be unscoped — and Express 4
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

// Everyone reads and signs their own. A policy library nobody outside the
// office can open is a filing cabinet, not a governance record — and the
// signature is the half an inspector asks for.
router.get('/mine', myPolicies);
router.get('/mine/:id', myPolicy);
router.get('/mine/:id/attachment', downloadMyPolicyAttachment);
router.post('/:id/sign', signPolicy);

// Writing the library is the office's.
router.get('/', requirePermission('manage_policies'), listPolicies);
router.get('/:id', requirePermission('manage_policies'), getPolicy);
router.post('/', requirePermission('manage_policies'), createPolicy);
router.patch('/:id', requirePermission('manage_policies'), updatePolicy);
router.delete('/:id', requirePermission('manage_policies'), deletePolicy);

router.get('/:id/attachment', requirePermission('manage_policies'), downloadPolicyAttachment);
router.post('/:id/attachment', requirePermission('manage_policies'), uploadSingle, scoped(uploadPolicyAttachment));
router.delete('/:id/attachment', requirePermission('manage_policies'), deletePolicyAttachment);

// Deliberately no DELETE on the library itself beyond the above. CQC can ask
// for a summary of every policy in force.

export default router;
