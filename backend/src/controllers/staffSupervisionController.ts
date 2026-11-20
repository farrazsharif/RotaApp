import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isScoped, staffScopeOr } from '../lib/scope';
import { userHasPermission } from '../middleware/permissions';

// answers / observations are stored as JSON strings. Accept either a string or
// an object from the client and always persist a valid JSON string.
function asJson(value: unknown, fallback = '{}'): string {
  if (value === undefined) return fallback;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  try { JSON.parse(raw); return raw; } catch { return fallback; }
}

function buildData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const f of ['position', 'serviceUsers', 'assessorName', 'assessorSignature', 'staffSignature', 'source', 'note']) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.date !== undefined) {
    const d = new Date(body.date as string);
    data.date = d;
    // Next supervision is due 3 months after this one.
    data.nextReviewDate = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate());
  }
  // Optional explicit next-due override (a different cadence, or when seeding a
  // historic paper supervision) — wins over the auto +3 months above.
  if (body.nextReviewDate) {
    const n = new Date(body.nextReviewDate as string);
    if (!isNaN(n.getTime())) data.nextReviewDate = n;
  }
  if (body.answers !== undefined) data.answers = asJson(body.answers);
  if (body.observations !== undefined) data.observations = asJson(body.observations);
  return data;
}

export async function listSupervisions(req: AuthRequest, res: Response) {
  const { userId } = req.query;
  const where: Record<string, unknown> = {};
  if (userId) where.userId = String(userId);
  // Site-scoped managers only see supervisions for staff on their sites.
  if (isScoped(req.user)) where.user = { OR: staffScopeOr(req.user) };
  const items = await prisma.supervision.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  res.json(items);
}

export async function getSupervision(req: AuthRequest, res: Response) {
  const item = await prisma.supervision.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Supervision not found' });
  res.json(item);
}

export async function createSupervision(req: AuthRequest, res: Response) {
  const { userId, date } = req.body;
  if (!userId || !date) return res.status(400).json({ error: 'userId and date are required' });

  // Recording a supervision held on paper says a conversation took place on a
  // day nobody here witnessed, which is why it is an administrator's call.
  //
  // Anyone else needs `record_paper_supervision`, and then on a stricter rule
  // than the administrator works to: they must name the signed form, and it
  // must already be on that carer's file. An administrator reading a folder in
  // front of them is exercising judgement; a caller that cannot produce the
  // form is guessing, and a supervision nobody held reads to an inspector as
  // one that was.
  let evidenceFileName: string | null = null;
  if (req.body.source === 'paper' && req.user!.role !== 'ADMIN') {
    if (!(await userHasPermission(req, 'record_paper_supervision'))) {
      return res.status(403).json({ error: 'Only an administrator can record a previous (paper) supervision.' });
    }
    const named = typeof req.body.evidenceFileName === 'string' ? req.body.evidenceFileName.trim() : '';
    if (!named) {
      return res.status(400).json({
        error: 'evidenceFileName is required: name the signed supervision form already on this staff file.',
      });
    }
    const form = await prisma.document.findFirst({
      where: { ownerType: 'USER', ownerId: userId, fileName: named },
      select: { id: true },
    });
    if (!form) {
      return res.status(422).json({
        error: `No document named "${named}" on that staff file. File the signed supervision form first, then record it.`,
      });
    }
    evidenceFileName = named;
  } else if (req.user!.role !== 'ADMIN' && !(await userHasPermission(req, 'manage_supervision'))) {
    // Got through the route on `record_paper_supervision` alone. That grants
    // backdating a form somebody signed - not writing a supervision from
    // scratch, which has answers, observations and two signatures on it.
    return res.status(403).json({
      error: 'That capability only covers recording a paper supervision already on file (source: "paper").',
    });
  }

  const data = buildData(req.body);
  data.userId = userId;
  data.date = new Date(date);
  // Keep the record pointing at its evidence, whatever note the caller sent.
  if (evidenceFileName) {
    const note = typeof data.note === 'string' ? data.note : '';
    data.note = note.includes(evidenceFileName) ? note : `${note ? `${note} ` : ''}[form: ${evidenceFileName}]`;
  }
  const item = await prisma.supervision.create({ data: data as never });
  res.status(201).json(item);
}

export async function updateSupervision(req: AuthRequest, res: Response) {
  const existing = await prisma.supervision.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Supervision not found' });
  const item = await prisma.supervision.update({ where: { id: req.params.id }, data: buildData(req.body) as never });
  res.json(item);
}

export async function deleteSupervision(req: AuthRequest, res: Response) {
  await prisma.supervision.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}
