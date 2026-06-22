import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export async function listSites(_req: AuthRequest, res: Response) {
  const sites = await prisma.site.findMany({
    include: { _count: { select: { serviceUsers: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(sites);
}

export async function createSite(req: AuthRequest, res: Response) {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const existing = await prisma.site.findUnique({ where: { name } });
  if (existing) return res.status(409).json({ error: 'A site with that name already exists' });

  const site = await prisma.site.create({ data: { name, color: color || '#3b82f6' } });
  res.status(201).json(site);
}

export async function updateSite(req: AuthRequest, res: Response) {
  const { name, color } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;

  const site = await prisma.site.update({ where: { id: req.params.id }, data });
  res.json(site);
}

export async function deleteSite(req: AuthRequest, res: Response) {
  // Detach patients from the site, then delete it
  await prisma.serviceUser.updateMany({ where: { siteId: req.params.id }, data: { siteId: null } });
  await prisma.site.delete({ where: { id: req.params.id } });
  res.json({ message: 'Site deleted' });
}
