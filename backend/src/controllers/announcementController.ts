import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitToUser } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { runWithCompany } from '../lib/tenantContext';

// Carer view: announcements broadcast to everyone (targetUserId null) plus any
// addressed to this carer. Newest first.
export async function listAnnouncements(req: AuthRequest, res: Response) {
  const items = await prisma.announcement.findMany({
    where: { OR: [{ targetUserId: null }, { targetUserId: req.user!.id }] },
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
  const { title, body, targetUserId } = req.body as { title?: string; body?: string; targetUserId?: string };
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'A message is required' });

  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true } });
  const authorName = me ? `${me.firstName} ${me.lastName}` : 'Office';

  const target = targetUserId || null;
  if (target) {
    const exists = await prisma.user.findFirst({ where: { id: target, active: true }, select: { id: true } });
    if (!exists) return res.status(400).json({ error: 'Selected carer is unavailable' });
  }

  const announcement = await prisma.announcement.create({
    data: { title: title?.trim() || null, body: String(body).trim(), authorId: req.user!.id, authorName, targetUserId: target },
  });

  // Notify recipients (in-app + push) in the background so a broadcast to many
  // carers doesn't hold up the response. Re-wrap in the tenant context so the
  // background Prisma writes stay company-scoped.
  const companyId = req.user!.companyId;
  const notify = async () => {
    const recipients = target
      ? [{ id: target }]
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
