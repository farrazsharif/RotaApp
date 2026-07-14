import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { relatedServiceUserScopeWhere } from '../lib/scope';

const include = {
  user: { select: { id: true, firstName: true, lastName: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
  shift: {
    select: {
      id: true, date: true, startTime: true, endTime: true, visitName: true,
      // Needed so the UI can show the carer's actual clock in/out times
      // for the visit rather than the scheduled visit window.
      clockRecords: { select: { userId: true, clockIn: true, clockOut: true } },
    },
  },
};

type Signature = { userId: string; firstName: string; lastName: string; signedAt: string };

function parseSigs(raw: string | null): Signature[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function selfSignature(req: AuthRequest): Promise<Signature> {
  const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  return {
    userId: req.user!.id,
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    signedAt: new Date().toISOString(),
  };
}

export async function createCallLog(req: AuthRequest, res: Response) {
  const { serviceUserId, shiftId, note } = req.body;
  if (!serviceUserId || !note || !String(note).trim()) {
    return res.status(400).json({ error: 'serviceUserId and note are required' });
  }

  // One shared log per visit: if a log already exists for this shift, funnel
  // the write into it (update note + re-sign) instead of creating a duplicate.
  if (shiftId) {
    const existing = await prisma.callLog.findFirst({ where: { shiftId } });
    if (existing) {
      const log = await prisma.callLog.update({
        where: { id: existing.id },
        data: { note: String(note).trim(), signedBy: JSON.stringify([await selfSignature(req)]) },
        include,
      });
      return res.json(log);
    }
  }

  const log = await prisma.callLog.create({
    data: {
      serviceUserId,
      shiftId: shiftId || null,
      userId: req.user!.id,
      note: String(note).trim(),
      // Author signs on create.
      signedBy: JSON.stringify([await selfSignature(req)]),
    },
    include,
  });
  res.status(201).json(log);
}

// A co-carer confirms & signs the existing shared log (no retyping).
export async function signCallLog(req: AuthRequest, res: Response) {
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  // Only a carer actually assigned to the visit may sign its log.
  if (existing.shiftId) {
    const shift = await prisma.shift.findUnique({
      where: { id: existing.shiftId },
      select: { userId: true, coverCarers: { select: { id: true } } },
    });
    const onShift = !!shift && (shift.userId === req.user!.id || shift.coverCarers.some((c) => c.id === req.user!.id));
    if (!onShift) return res.status(403).json({ error: 'You are not assigned to this call' });
  }

  const sigs = parseSigs(existing.signedBy);
  // Legacy logs may have no signedBy yet — seed with the original author.
  if (sigs.length === 0 && existing.userId) {
    sigs.push({ userId: existing.userId, firstName: '', lastName: '', signedAt: existing.createdAt.toISOString() });
  }
  if (!sigs.some((s) => s.userId === req.user!.id)) {
    sigs.push(await selfSignature(req));
  }
  const log = await prisma.callLog.update({
    where: { id: existing.id },
    data: { signedBy: JSON.stringify(sigs) },
    include,
  });
  res.json(log);
}

export async function listCallLogs(req: AuthRequest, res: Response) {
  const { serviceUserId } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = serviceUserId;
  Object.assign(where, relatedServiceUserScopeWhere(req.user));

  const logs = await prisma.callLog.findMany({
    where,
    include,
    orderBy: { createdAt: 'desc' },
  });
  res.json(logs);
}

export async function updateCallLog(req: AuthRequest, res: Response) {
  const { note } = req.body;
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'note is required' });
  }
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  // Editing the wording invalidates prior sign-offs: reset to just the editor,
  // so co-carers are asked to re-sign the changed note.
  const noteChanged = String(note).trim() !== existing.note;
  const data: Record<string, unknown> = { note: String(note).trim() };
  if (noteChanged) data.signedBy = JSON.stringify([await selfSignature(req)]);

  const log = await prisma.callLog.update({
    where: { id: req.params.id },
    data,
    include,
  });
  res.json(log);
}

export async function deleteCallLog(req: AuthRequest, res: Response) {
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Call log not found' });

  await prisma.callLog.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
