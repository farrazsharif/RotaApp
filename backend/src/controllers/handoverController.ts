import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitToUser } from '../lib/socket';
import { sendPushToUser } from '../lib/push';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(d: Date): string {
  const dt = new Date(d);
  return `${DAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

const handoverInclude = {
  shift: {
    select: {
      id: true, date: true, startTime: true, endTime: true, visitName: true, userId: true, published: true,
      serviceUser: { select: { id: true, firstName: true, lastName: true, site: { select: { name: true } } } },
    },
  },
  fromUser: { select: { id: true, firstName: true, lastName: true } },
  toUser: { select: { id: true, firstName: true, lastName: true } },
};

type ShiftLite = {
  date: Date; startTime: string; endTime: string; visitName: string | null;
  serviceUser?: { firstName: string; lastName: string } | null;
};

function shiftLine(shift: ShiftLite): string {
  const who = shift.serviceUser ? `${shift.serviceUser.firstName} ${shift.serviceUser.lastName}` : 'a client';
  return `${who} · ${shortDate(shift.date)} ${shift.startTime}–${shift.endTime}`;
}

// Is the given user currently a carer on the shift (primary or cover)?
function userOnShift(shift: { userId: string | null; coverCarers: { id: string }[] }, userId: string): boolean {
  return shift.userId === userId || shift.coverCarers.some((c) => c.id === userId);
}

// Move a carer slot on a shift from one carer to another (primary or cover).
async function reassignShift(shiftId: string, fromUserId: string, toUserId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, userId: true, coverCarers: { select: { id: true } } },
  });
  if (!shift) return;
  if (shift.userId === fromUserId) {
    await prisma.shift.update({ where: { id: shiftId }, data: { userId: toUserId } });
  } else if (shift.coverCarers.some((c) => c.id === fromUserId)) {
    await prisma.shift.update({
      where: { id: shiftId },
      data: { coverCarers: { disconnect: { id: fromUserId }, connect: { id: toUserId } } },
    });
  }
}

// GET /handovers/eligible?shiftId= — carers this shift can be handed to.
export async function eligibleCarers(req: AuthRequest, res: Response) {
  const shiftId = String(req.query.shiftId || '');
  const shift = shiftId
    ? await prisma.shift.findUnique({ where: { id: shiftId }, select: { userId: true, coverCarers: { select: { id: true } } } })
    : null;
  const excludeIds = new Set<string>([req.user!.id]);
  if (shift) {
    if (shift.userId) excludeIds.add(shift.userId);
    shift.coverCarers.forEach((c) => excludeIds.add(c.id));
  }
  const carers = await prisma.user.findMany({
    where: { active: true, id: { notIn: [...excludeIds] } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json(carers);
}

// POST /handovers — a carer requests to hand their call to another carer.
export async function requestHandover(req: AuthRequest, res: Response) {
  const { shiftId, toUserId, reason } = req.body as { shiftId?: string; toUserId?: string; reason?: string };
  if (!shiftId || !toUserId) return res.status(400).json({ error: 'shiftId and toUserId are required' });
  if (toUserId === req.user!.id) return res.status(400).json({ error: 'You cannot hand a call to yourself' });

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, userId: true, status: true, coverCarers: { select: { id: true } } },
  });
  if (!shift) return res.status(404).json({ error: 'Call not found' });
  if (shift.status === 'CANCELLED') return res.status(400).json({ error: 'This call has been cancelled' });
  if (!userOnShift(shift, req.user!.id)) return res.status(403).json({ error: 'You are not assigned to this call' });
  if (userOnShift(shift, toUserId)) return res.status(400).json({ error: 'That carer is already on this call' });

  const toUser = await prisma.user.findFirst({ where: { id: toUserId, active: true }, select: { id: true } });
  if (!toUser) return res.status(400).json({ error: 'Selected carer is unavailable' });

  // One live request per (call, requester) — reuse an existing pending one.
  const existing = await prisma.shiftHandover.findFirst({
    where: { shiftId, fromUserId: req.user!.id, status: 'PENDING' },
  });
  if (existing) {
    await prisma.shiftHandover.update({ where: { id: existing.id }, data: { toUserId, reason: reason || null } });
  } else {
    await prisma.shiftHandover.create({
      data: { shiftId, fromUserId: req.user!.id, toUserId, reason: reason || null, status: 'PENDING' },
    });
  }

  const handover = await prisma.shiftHandover.findFirst({
    where: { shiftId, fromUserId: req.user!.id, status: 'PENDING' },
    include: handoverInclude,
  });
  if (!handover) return res.status(500).json({ error: 'Could not create request' });

  const fromName = `${handover.fromUser.firstName} ${handover.fromUser.lastName}`;
  const msg = `${fromName} has asked you to cover ${shiftLine(handover.shift as ShiftLite)}`;
  const n = await prisma.notification.create({
    data: { userId: toUserId, type: 'SHIFT_HANDOVER', title: 'Cover Request', message: msg, data: JSON.stringify({ handoverId: handover.id, shiftId }) },
  });
  emitToUser(toUserId, 'notification', n);
  await sendPushToUser(toUserId, { title: 'Cover Request', body: msg, url: '/' });

  res.status(201).json(handover);
}

// GET /handovers/mine — the logged-in carer's incoming + outgoing requests.
export async function myHandovers(req: AuthRequest, res: Response) {
  const me = req.user!.id;
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // recent responses still visible
  const [incoming, outgoing] = await Promise.all([
    prisma.shiftHandover.findMany({
      where: { toUserId: me, status: 'PENDING' },
      include: handoverInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shiftHandover.findMany({
      where: { fromUserId: me, OR: [{ status: 'PENDING' }, { respondedAt: { gte: since } }] },
      include: handoverInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json({ incoming, outgoing });
}

// POST /handovers/:id/respond { action: 'ACCEPT' | 'DECLINE' }
export async function respondHandover(req: AuthRequest, res: Response) {
  const action = String((req.body as { action?: string }).action || '').toUpperCase();
  if (action !== 'ACCEPT' && action !== 'DECLINE') return res.status(400).json({ error: 'Invalid action' });

  const handover = await prisma.shiftHandover.findUnique({ where: { id: req.params.id }, include: handoverInclude });
  if (!handover) return res.status(404).json({ error: 'Request not found' });
  if (handover.toUserId !== req.user!.id) return res.status(403).json({ error: 'This request is not for you' });
  if (handover.status !== 'PENDING') return res.status(400).json({ error: 'This request has already been dealt with' });

  const toName = `${handover.toUser.firstName} ${handover.toUser.lastName}`;
  const line = shiftLine(handover.shift as ShiftLite);

  if (action === 'DECLINE') {
    await prisma.shiftHandover.update({ where: { id: handover.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
    const msg = `${toName} declined to cover ${line}`;
    const n = await prisma.notification.create({
      data: { userId: handover.fromUserId, type: 'SHIFT_HANDOVER', title: 'Cover Declined', message: msg, data: JSON.stringify({ handoverId: handover.id }) },
    });
    emitToUser(handover.fromUserId, 'notification', n);
    await sendPushToUser(handover.fromUserId, { title: 'Cover Declined', body: msg });
    return res.json({ ...handover, status: 'DECLINED' });
  }

  // ACCEPT — reassign the call immediately so the covering carer can clock in.
  await reassignShift(handover.shiftId, handover.fromUserId, handover.toUserId);
  await prisma.shiftHandover.update({ where: { id: handover.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });

  const toMsg = `${toName} accepted and is now covering ${line}`;
  const n = await prisma.notification.create({
    data: { userId: handover.fromUserId, type: 'SHIFT_HANDOVER', title: 'Cover Accepted', message: toMsg, data: JSON.stringify({ handoverId: handover.id }) },
  });
  emitToUser(handover.fromUserId, 'notification', n);
  await sendPushToUser(handover.fromUserId, { title: 'Cover Accepted', body: toMsg });

  res.json({ ...handover, status: 'ACCEPTED' });
}

// POST /handovers/:id/cancel — the requester withdraws a pending request.
export async function cancelHandover(req: AuthRequest, res: Response) {
  const handover = await prisma.shiftHandover.findUnique({ where: { id: req.params.id } });
  if (!handover) return res.status(404).json({ error: 'Request not found' });
  if (handover.fromUserId !== req.user!.id) return res.status(403).json({ error: 'Not your request' });
  if (handover.status !== 'PENDING') return res.status(400).json({ error: 'This request can no longer be cancelled' });
  await prisma.shiftHandover.update({ where: { id: handover.id }, data: { status: 'CANCELLED', respondedAt: new Date() } });
  res.json({ ok: true });
}

// GET /handovers — manager review list (recent handovers, all statuses).
export async function listHandovers(req: AuthRequest, res: Response) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const handovers = await prisma.shiftHandover.findMany({
    where: { createdAt: { gte: since } },
    include: handoverInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(handovers);
}

// POST /handovers/:id/revert — a manager undoes an accepted handover.
export async function revertHandover(req: AuthRequest, res: Response) {
  const handover = await prisma.shiftHandover.findUnique({ where: { id: req.params.id }, include: handoverInclude });
  if (!handover) return res.status(404).json({ error: 'Request not found' });
  if (handover.status !== 'ACCEPTED') return res.status(400).json({ error: 'Only an accepted handover can be reverted' });

  // Put the call back to the original carer.
  await reassignShift(handover.shiftId, handover.toUserId, handover.fromUserId);
  await prisma.shiftHandover.update({ where: { id: handover.id }, data: { status: 'REVERTED' } });

  const line = shiftLine(handover.shift as ShiftLite);
  const fromName = `${handover.fromUser.firstName} ${handover.fromUser.lastName}`;
  for (const uid of [handover.fromUserId, handover.toUserId]) {
    const msg = `A manager reverted the cover for ${line}. It is assigned to ${fromName}.`;
    const n = await prisma.notification.create({
      data: { userId: uid, type: 'SHIFT_HANDOVER', title: 'Cover Reverted', message: msg, data: JSON.stringify({ handoverId: handover.id }) },
    });
    emitToUser(uid, 'notification', n);
    await sendPushToUser(uid, { title: 'Cover Reverted', body: msg });
  }

  res.json({ ...handover, status: 'REVERTED' });
}
