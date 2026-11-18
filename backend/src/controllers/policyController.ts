import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { storageConfigured, putObject, deleteObject, getDownloadUrl } from '../lib/storage';
import { randomUUID } from 'crypto';

// The policy register (Reg 17).
//
// A list of the policies the service runs on: what it is called, what it
// covers, when it was last reviewed, and the document itself. That is what an
// inspector asks to see, and it is the whole of this module.
//
// It deliberately has no draft/published states, no per-policy audience and no
// read-and-sign. Those were built and then taken out: a register of 147
// documents does not need a publishing workflow to be useful, and the
// machinery was costing more attention than it earned. If staff sign-off is
// wanted later it goes back on top of this, rather than this being shaped
// around it now.

export const POLICY_CATEGORIES = [
  'SAFEGUARDING',
  'MEDICATION',
  'HEALTH_SAFETY',
  'IPC',
  'HR',
  'DATA',
  'CARE',
  'COMPLAINTS',
  'BUSINESS_CONTINUITY',
  'OTHER',
];

// The original document. One per policy in practice; the array is what the
// column already holds and leaves room for a second without a migration.
export interface PolicyFile {
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

function parseFiles(json?: string | null): PolicyFile[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? (v as PolicyFile[]).filter((f) => f && typeof f.key === 'string') : [];
  } catch {
    return [];
  }
}

// What a screen needs to render a download button, without the storage keys -
// those stay server-side and a signed URL is minted per request.
const fileSummary = (json?: string | null) =>
  parseFiles(json).map((f) => ({ fileName: f.fileName, contentType: f.contentType, size: f.size }));

function clean(v: unknown, max = 300000): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, max);
}

function date(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function oneOf(v: unknown, allowed: string[], fallback: string): string {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return allowed.includes(s) ? s : fallback;
}

const selectFields = {
  id: true,
  title: true,
  category: true,
  // Holds the date the policy was LAST reviewed. The column kept its original
  // name through the simplification; every row was null at the time, so there
  // is no older meaning sitting in the data to be misread.
  reviewDate: true,
  attachments: true,
  updatedAt: true,
};

const shape = (p: {
  id: string;
  title: string;
  category: string;
  reviewDate: Date | null;
  attachments: string;
  updatedAt: Date;
}) => ({
  id: p.id,
  title: p.title,
  category: p.category,
  reviewedAt: p.reviewDate,
  files: fileSummary(p.attachments),
  updatedAt: p.updatedAt,
});

// GET /api/policies
export async function listPolicies(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  const category = String(req.query.category || '');
  if (POLICY_CATEGORIES.includes(category)) where.category = category;

  const rows = await prisma.policy.findMany({
    where,
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
    select: selectFields,
  });
  res.json(rows.map(shape));
}

// GET /api/policies/:id
export async function getPolicy(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({ where: { id: req.params.id }, select: selectFields });
  if (!policy) return res.status(404).json({ error: 'Not found' });
  res.json(shape(policy));
}

// POST /api/policies
export async function createPolicy(req: AuthRequest, res: Response) {
  const b = req.body as Record<string, unknown>;
  const title = clean(b.title, 300);
  if (!title) return res.status(400).json({ error: 'Give the policy a title.' });

  const policy = await prisma.policy.create({
    data: {
      title,
      category: oneOf(b.category, POLICY_CATEGORIES, 'OTHER'),
      reviewDate: date(b.reviewedAt) ?? null,
    },
    select: selectFields,
  });

  await logAudit(req, 'POLICY_CREATED', policy.id, `Policy added: ${title}`);
  res.status(201).json(shape(policy));
}

// PATCH /api/policies/:id
export async function updatePolicy(req: AuthRequest, res: Response) {
  const existing = await prisma.policy.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const b = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (b.title !== undefined) {
    const title = clean(b.title, 300);
    if (!title) return res.status(400).json({ error: 'A policy needs a title.' });
    data.title = title;
  }
  if (b.category !== undefined) data.category = oneOf(b.category, POLICY_CATEGORIES, 'OTHER');
  const reviewed = date(b.reviewedAt);
  if (reviewed !== undefined) data.reviewDate = reviewed;

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const policy = await prisma.policy.update({ where: { id: existing.id }, data, select: selectFields });
  res.json(shape(policy));
}

// DELETE /api/policies/:id — takes the stored document with it, so the bucket
// does not fill with objects nothing points at.
export async function deletePolicy(req: AuthRequest, res: Response) {
  const existing = await prisma.policy.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, attachments: true },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  for (const f of parseFiles(existing.attachments)) {
    await deleteObject(f.key).catch(() => { /* already gone */ });
  }
  await prisma.policy.delete({ where: { id: existing.id } });
  await logAudit(req, 'POLICY_DELETED', existing.id, `Policy deleted: ${existing.title}`);
  res.json({ ok: true });
}

// --- The document ----------------------------------------------------------

const MAX_BYTES = 20 * 1024 * 1024;

// POST /api/policies/:id/attachment
export async function uploadPolicyAttachment(req: AuthRequest, res: Response) {
  if (!storageConfigured()) {
    return res.status(503).json({
      error: 'Document storage is not set up yet. Add the Cloudflare R2 keys to enable uploads.',
      code: 'STORAGE_NOT_CONFIGURED',
    });
  }
  const policy = await prisma.policy.findUnique({ where: { id: req.params.id } });
  if (!policy) return res.status(404).json({ error: 'Not found' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (file.mimetype !== 'application/pdf') {
    return res.status(400).json({ error: 'Attach a PDF. It is what prints and what an inspector is handed.' });
  }
  if (file.size > MAX_BYTES) return res.status(400).json({ error: 'File is too large (max 20MB)' });

  const fileName = (file.originalname || 'policy.pdf').slice(0, 200);
  const files = parseFiles(policy.attachments);

  // Replacing rather than piling up: a policy with three slightly different
  // PDFs on it is worse than one with none, because nobody can tell which is
  // the one in force. The old object leaves the bucket too.
  for (const old of files) {
    await deleteObject(old.key).catch(() => { /* already gone */ });
  }

  const key = `policies/${policy.id}/${randomUUID()}.pdf`;
  await putObject(key, file.buffer, file.mimetype);

  const next: PolicyFile = {
    key,
    fileName,
    contentType: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  await prisma.policy.update({ where: { id: policy.id }, data: { attachments: JSON.stringify([next]) } });

  await logAudit(req, 'POLICY_FILE_ATTACHED', policy.id, `${fileName} attached to ${policy.title}`);
  res.status(201).json({ fileName, contentType: next.contentType, size: next.size });
}

// GET /api/policies/:id/attachment — a five-minute signed URL straight to
// storage, so the bytes never stream back through the API and a forwarded
// link stops working.
export async function downloadPolicyAttachment(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({
    where: { id: req.params.id },
    select: { id: true, attachments: true },
  });
  if (!policy) return res.status(404).json({ error: 'Not found' });

  const files = parseFiles(policy.attachments);
  if (files.length === 0) return res.status(404).json({ error: 'This policy has no document attached.' });
  if (!storageConfigured()) {
    return res.status(503).json({ error: 'Document storage is not set up.', code: 'STORAGE_NOT_CONFIGURED' });
  }

  // inline: a policy is for reading, so it opens in the viewer rather than
  // landing in a downloads folder the reader then has to go and find.
  const url = await getDownloadUrl(files[0].key, files[0].fileName, true);
  res.json({ url, fileName: files[0].fileName });
}

// DELETE /api/policies/:id/attachment
export async function deletePolicyAttachment(req: AuthRequest, res: Response) {
  const policy = await prisma.policy.findUnique({ where: { id: req.params.id } });
  if (!policy) return res.status(404).json({ error: 'Not found' });

  const files = parseFiles(policy.attachments);
  if (files.length === 0) return res.status(404).json({ error: 'Nothing attached.' });

  for (const f of files) await deleteObject(f.key).catch(() => { /* already gone */ });
  await prisma.policy.update({ where: { id: policy.id }, data: { attachments: '[]' } });
  await logAudit(req, 'POLICY_FILE_REMOVED', policy.id, `Document removed from ${policy.title}`);
  res.json({ ok: true });
}
