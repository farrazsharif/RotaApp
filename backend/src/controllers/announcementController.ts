import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitToUser } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { runWithCompany } from '../lib/tenantContext';

// Carer view: broadcasts (no target set) plus any addressed to this carer,
// whether via the legacy single target or the multi-recipient list. Newest first.
export async function listAnnouncements(req: AuthRequest, res: Response) {
  const me = req.user!.id;
  const items = await prisma.announcement.findMany({
    where: {
      OR: [
        { AND: [{ targetUserId: null }, { targetUserIds: '[]' }] }, // broadcast to all
        { targetUserId: me },                                       // legacy single target
        { targetUserIds: { contains: `"${me}"` } },                 // in the recipient list
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(items);
}

// Manager view: every announcement, to manage/delete.
export async function listAllAnnouncements(_req: AuthRequest, res: Response) {
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  res.json(items);
}

export async function createAnnouncement(req: AuthRequest, res: Response) {
  const { title, body, targetUserId, targetUserIds } = req.body as { title?: string; body?: string; targetUserId?: string; targetUserIds?: string[] };
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'A message is required' });

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  const authorName = me ? `${me.firstName} ${me.lastName}` : 'Office';

  // Recipients can come as a list (multi-select) or the legacy single target.
  // An empty/absent list means broadcast to all carers.
  const requested = Array.isArray(targetUserIds) && targetUserIds.length
    ? Array.from(new Set(targetUserIds.filter(Boolean)))
    : (targetUserId ? [targetUserId] : []);
  let recipientIds: string[] = [];
  if (requested.length) {
    const found = await prisma.user.findMany({ where: { id: { in: requested }, active: true }, select: { id: true } });
    recipientIds = found.map((u) => u.id);
    if (!recipientIds.length) return res.status(400).json({ error: 'Selected carers are unavailable' });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title?.trim() || null, body: String(body).trim(), authorId: req.user!.id, authorName,
      // Keep the legacy single field populated when exactly one carer is chosen
      // so older clients still render it; the list holds the full recipient set.
      targetUserId: recipientIds.length === 1 ? recipientIds[0] : null,
      targetUserIds: JSON.stringify(recipientIds),
    },
  });

  // Notify recipients (in-app + push) in the background so a broadcast to many
  // carers doesn't hold up the response. Re-wrap in the tenant context so the
  // background Prisma writes stay company-scoped.
  const companyId = req.user!.companyId;
  const notify = async () => {
    const recipients = recipientIds.length
      ? recipientIds.map((id) => ({ id }))
      : await prisma.user.findMany({ where: { active: true, id: { not: req.user!.id } }, select: { id: true } });
    const msg = announcement.title ? `${announcement.title}: ${announcement.body}` : announcement.body;
    await Promise.all(recipients.map(async (r) => {
      const n = await prisma.notification.create({
        data: { userId: r.id, type: 'ANNOUNCEMENT', title: 'New Message', message: msg.slice(0, 240), data: JSON.stringify({ announcementId: announcement.id }) },
      });
      emitToUser(r.id, 'notification', n);
      await sendPushToUser(r.id, { title: 'New Message', body: msg.slice(0, 180), url: '/announcements' });
    }));
  };
  if (companyId) runWithCompany(companyId, () => notify().catch((e) => console.error('Announcement notify failed:', e)));
  else notify().catch((e) => console.error('Announcement notify failed:', e));

  res.status(201).json(announcement);
}

export async function deleteAnnouncement(req: AuthRequest, res: Response) {
  const item = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Announcement not found' });
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}
