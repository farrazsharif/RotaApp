import { Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { staffInScope, serviceUserInScope } from '../lib/scope';
import { getEffectivePermissions, PermissionKey } from '../middleware/permissions';
import { storageConfigured, putObject, deleteObject, getDownloadUrl } from '../lib/storage';

type OwnerType = 'USER' | 'SERVICE_USER';

function isOwnerType(v: unknown): v is OwnerType {
  return v === 'USER' || v === 'SERVICE_USER';
}

// An expiry date off the wire: 'YYYY-MM-DD' from a date input, or a full ISO
// string. Undefined means "not supplied, leave it alone"; null or empty means
// "clear it". Anything unparseable is an error rather than a silent drop - a
// date that looks recorded but isn't is worse than no date at all, because
// nobody goes chasing a renewal they believe is already tracked.
type ExpiryRead = { ok: true; value: Date | null | undefined } | { ok: false };
function readExpiry(v: unknown): ExpiryRead {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null || v === '') return { ok: true, value: null };
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d };
}

// The capability that governs documents of a given owner type.
function manageKeyFor(ownerType: OwnerType): PermissionKey {
  return ownerType === 'SERVICE_USER' ? 'manage_service_users' : 'manage_staff';
}

// Confirms the owner exists and is within the caller's site scope.
async function ownerInScope(req: AuthRequest, ownerType: OwnerType, ownerId: string): Promise<boolean> {
  return ownerType === 'SERVICE_USER'
    ? serviceUserInScope(req.user!, ownerId)
    : staffInScope(req.user!, ownerId);
}

// Whether the caller may add/remove documents for this owner type.
async function canManage(req: AuthRequest, ownerType: OwnerType): Promise<boolean> {
  const key = manageKeyFor(ownerType);
  if (req.user!.customPermissions) return req.user!.customPermissions.includes(key);
  const map = await getEffectivePermissions();
  return (map[key] || []).includes(req.user!.role);
}

const publicSelect = {
  id: true, ownerType: true, ownerId: true, category: true, expiresAt: true,
  fileName: true, contentType: true, size: true, createdAt: true, uploadedById: true,
};

// GET /api/documents/config — lets the UI show a "storage not set up" notice.
export function documentConfig(_req: AuthRequest, res: Response) {
  res.json({ configured: storageConfigured() });
}

// GET /api/documents?ownerType=&ownerId=
export async function listDocuments(req: AuthRequest, res: Response) {
  const { ownerType, ownerId } = req.query;
  if (!isOwnerType(ownerType) || typeof ownerId !== 'string') {
    return res.status(400).json({ error: 'ownerType and ownerId are required' });
  }
  if (!(await ownerInScope(req, ownerType, ownerId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  const documents = await prisma.document.findMany({
    where: { ownerType, ownerId },
    orderBy: { createdAt: 'desc' },
    select: publicSelect,
  });
  res.json(documents);
}

// POST /api/documents  (multipart: file + ownerType, ownerId, category)
export async function uploadDocument(req: AuthRequest, res: Response) {
  if (!storageConfigured()) {
    return res.status(503).json({ error: 'Document storage is not set up yet. Add the Cloudflare R2 keys to enable uploads.', code: 'STORAGE_NOT_CONFIGURED' });
  }
  const file = req.file;
  const { ownerType, ownerId, category } = req.body as { ownerType?: string; ownerId?: string; category?: string };
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (!isOwnerType(ownerType) || typeof ownerId !== 'string') {
    return res.status(400).json({ error: 'ownerType and ownerId are required' });
  }
  // Checked before the file reaches R2, so a bad date can't leave an orphaned
  // object in the bucket with no row pointing at it.
  const expiry = readExpiry(req.body.expiresAt);
  if (!expiry.ok) return res.status(400).json({ error: 'Expiry date is not a valid date' });
  if (!(await ownerInScope(req, ownerType, ownerId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!(await canManage(req, ownerType))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  // Namespaced, unguessable key so objects are isolated per company/owner.
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const storageKey = `${req.user!.companyId}/${ownerType}/${ownerId}/${randomUUID()}-${safeName}`;
  await putObject(storageKey, file.buffer, file.mimetype);

  const doc = await prisma.document.create({
    data: {
      ownerType, ownerId,
      category: category?.trim() || null,
      expiresAt: expiry.value,
      fileName: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      storageKey,
      uploadedById: req.user!.id,
    },
    select: publicSelect,
  });
  res.status(201).json(doc);
}

// PATCH /api/documents/:id — the expiry date, and only that. The file itself
// is deliberately immutable: replacing one means a fresh upload, so the record
// of what was held, and from when, always survives.
export async function updateDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!(await ownerInScope(req, doc.ownerType as OwnerType, doc.ownerId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!(await canManage(req, doc.ownerType as OwnerType))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const expiry = readExpiry(req.body?.expiresAt);
  if (!expiry.ok) return res.status(400).json({ error: 'Expiry date is not a valid date' });
  if (expiry.value === undefined) return res.status(400).json({ error: 'Nothing to update' });

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { expiresAt: expiry.value },
    select: publicSelect,
  });
  res.json(updated);
}

// GET /api/documents/:id/download → short-lived signed URL
export async function downloadDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!(await ownerInScope(req, doc.ownerType as OwnerType, doc.ownerId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!storageConfigured()) {
    return res.status(503).json({ error: 'Document storage is not set up yet.' });
  }
  const url = await getDownloadUrl(doc.storageKey, doc.fileName, req.query.inline === '1');
  res.json({ url });
}

// DELETE /api/documents/:id
export async function deleteDocument(req: AuthRequest, res: Response) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!(await ownerInScope(req, doc.ownerType as OwnerType, doc.ownerId))) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!(await canManage(req, doc.ownerType as OwnerType))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  // Best-effort remove from R2; always drop the DB row so the list stays clean.
  if (storageConfigured()) {
    try { await deleteObject(doc.storageKey); } catch { /* leave the object; row is gone */ }
  }
  await prisma.document.delete({ where: { id: doc.id } });
  res.json({ message: 'Deleted' });
}
