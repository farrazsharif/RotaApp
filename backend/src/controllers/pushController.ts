import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { pushConfigured } from '../lib/push';

export async function getVapidKey(_req: AuthRequest, res: Response) {
  res.json({ publicKey: pushConfigured ? process.env.VAPID_PUBLIC_KEY : null });
}

export async function subscribe(req: AuthRequest, res: Response) {
  const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint and keys.p256dh/keys.auth are required' });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(201).json({ message: 'Subscribed' });
}

export async function unsubscribe(req: AuthRequest, res: Response) {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
  res.json({ message: 'Unsubscribed' });
}
