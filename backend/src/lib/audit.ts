import { AuthRequest } from '../middleware/auth';
import { prisma } from './prisma';

// Records a sensitive action. Never throws — auditing must not break the
// request it's recording. Pass `undoData` (any JSON-serialisable value) for
// actions that can be reversed later from the audit log — it's stored as JSON
// and read back by the undo endpoint (e.g. the deleted visit rows for a delete).
export async function logAudit(req: AuthRequest, action: string, target?: string, details?: string, undoData?: unknown) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        actorName: req.user?.email ?? 'system',
        action,
        target: target ?? null,
        details: details ?? null,
        undoData: undoData === undefined ? null : JSON.stringify(undoData),
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
