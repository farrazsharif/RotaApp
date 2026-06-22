import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role, TradeStatus } from '../constants';
import { emitToUser } from '../lib/socket';
import { sendEmail, tradeRequestEmail } from '../lib/email';

const tradeInclude = {
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  shift: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
  targetShift: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
};

export async function listTrades(req: AuthRequest, res: Response) {
  const where: Record<string, unknown> = {};
  if (req.user!.role === Role.EMPLOYEE) {
    where.OR = [{ requesterId: req.user!.id }, { targetUserId: req.user!.id }];
  }
  if (req.query.status) where.status = req.query.status;

  const trades = await prisma.shiftTrade.findMany({
    where,
    include: tradeInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(trades);
}

export async function createTrade(req: AuthRequest, res: Response) {
  const { shiftId, targetUserId, targetShiftId, message } = req.body;
  if (!shiftId) return res.status(400).json({ error: 'shiftId required' });

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.userId !== req.user!.id) return res.status(403).json({ error: 'Not your shift' });

  const trade = await prisma.shiftTrade.create({
    data: {
      requesterId: req.user!.id,
      shiftId,
      targetUserId: targetUserId || null,
      targetShiftId: targetShiftId || null,
      message: message || null,
    },
    include: tradeInclude,
  });

  if (targetUserId) {
    const notification = await prisma.notification.create({
      data: {
        userId: targetUserId,
        type: 'TRADE_REQUEST',
        title: 'Shift Trade Request',
        message: `${trade.requester.firstName} wants to trade their shift on ${new Date(shift.date).toDateString()}`,
        data: JSON.stringify({ tradeId: trade.id }),
      },
    });
    emitToUser(targetUserId, 'notification', notification);

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (targetUser) {
      sendEmail(targetUser.email, 'Shift Trade Request', tradeRequestEmail(
        `${trade.requester.firstName} ${trade.requester.lastName}`,
        new Date(shift.date).toDateString(), shift.startTime, shift.endTime
      ));
    }
  }

  res.status(201).json(trade);
}

export async function respondToTrade(req: AuthRequest, res: Response) {
  const { action } = req.body; // 'accept' | 'reject'
  const trade = await prisma.shiftTrade.findUnique({ where: { id: req.params.id }, include: tradeInclude });
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (trade.targetUserId !== req.user!.id) return res.status(403).json({ error: 'Not your trade to respond to' });
  if (trade.status !== TradeStatus.PENDING) return res.status(400).json({ error: 'Trade already actioned' });

  const status = action === 'accept' ? TradeStatus.ACCEPTED : TradeStatus.REJECTED;
  const updated = await prisma.shiftTrade.update({ where: { id: req.params.id }, data: { status }, include: tradeInclude });

  const notifType = action === 'accept' ? 'TRADE_ACCEPTED' : 'TRADE_REJECTED';
  const notifTitle = action === 'accept' ? 'Trade Request Accepted' : 'Trade Request Rejected';
  const notification = await prisma.notification.create({
    data: {
      userId: trade.requesterId,
      type: notifType,
      title: notifTitle,
      message: `${trade.targetUser?.firstName} has ${action}ed your shift trade request`,
      data: JSON.stringify({ tradeId: trade.id }),
    },
  });
  emitToUser(trade.requesterId, 'notification', notification);

  res.json(updated);
}

export async function approveTrade(req: AuthRequest, res: Response) {
  const { action } = req.body; // 'approve' | 'reject'
  const trade = await prisma.shiftTrade.findUnique({ where: { id: req.params.id }, include: tradeInclude });
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (trade.status !== TradeStatus.ACCEPTED) return res.status(400).json({ error: 'Trade must be accepted first' });

  if (action === 'approve') {
    // Swap the shifts
    await prisma.$transaction([
      prisma.shift.update({ where: { id: trade.shiftId }, data: { userId: trade.targetUserId!, status: 'SWAPPED' } }),
      ...(trade.targetShiftId
        ? [prisma.shift.update({ where: { id: trade.targetShiftId }, data: { userId: trade.requesterId, status: 'SWAPPED' } })]
        : []),
      prisma.shiftTrade.update({ where: { id: req.params.id }, data: { status: TradeStatus.APPROVED } }),
    ]);
  } else {
    await prisma.shiftTrade.update({ where: { id: req.params.id }, data: { status: TradeStatus.REJECTED } });
  }

  // Notify both parties
  for (const userId of [trade.requesterId, trade.targetUserId].filter(Boolean) as string[]) {
    const n = await prisma.notification.create({
      data: {
        userId,
        type: 'TRADE_APPROVED',
        title: `Shift Trade ${action === 'approve' ? 'Approved' : 'Rejected'} by Manager`,
        message: `Your shift trade has been ${action === 'approve' ? 'approved' : 'rejected'} by a manager`,
        data: JSON.stringify({ tradeId: trade.id }),
      },
    });
    emitToUser(userId, 'notification', n);
  }

  const result = await prisma.shiftTrade.findUnique({ where: { id: req.params.id }, include: tradeInclude });
  res.json(result);
}

export async function cancelTrade(req: AuthRequest, res: Response) {
  const trade = await prisma.shiftTrade.findUnique({ where: { id: req.params.id } });
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (trade.requesterId !== req.user!.id) return res.status(403).json({ error: 'Not your trade' });

  await prisma.shiftTrade.update({ where: { id: req.params.id }, data: { status: TradeStatus.CANCELLED } });
  res.json({ message: 'Trade cancelled' });
}
