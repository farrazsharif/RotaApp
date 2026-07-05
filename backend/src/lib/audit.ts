import { AuthRequest } from '../middleware/auth';
import { prisma } from './prisma';

// Records a sensitive action. Never throws — auditing must not break the
// request it's recording.
export async function logAudit(req: AuthRequest, action: string, target?: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        actorName: req.user?.email ?? 'system',
        action,
        target: target ?? null,
        details: details ?? null,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
