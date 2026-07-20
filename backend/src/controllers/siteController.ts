import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { isScoped } from '../lib/scope';
import { logAudit } from '../lib/audit';

export async function listSites(req: AuthRequest, res: Response) {
  const where = isScoped(req.user) ? { id: { in: req.user!.siteIds } } : {};
  const sites = await prisma.site.findMany({
    where,
    include: { _count: { select: { serviceUsers: true } } },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
  res.json(sites);
}

function siteInScope(req: AuthRequest, siteId: string): boolean {
  return !isScoped(req.user) || req.user!.siteIds!.includes(siteId);
}

export async function createSite(req: AuthRequest, res: Response) {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const existing = await prisma.site.findUnique({ where: { name } });
  if (existing) return res.status(409).json({ error: 'A site with that name already exists' });

  // New sites go to the end of the display order.
  const last = await prisma.site.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
  const order = (last?.order ?? -1) + 1;
  const site = await prisma.site.create({ data: { name, color: color || '#3b82f6', order } });
  await logAudit(req, 'SITE_CREATED', site.name);
  res.status(201).json(site);
}

// Persist a new site display order. Body: { ids: string[] } in the desired order.
export async function reorderSites(req: AuthRequest, res: Response) {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  await Promise.all(
    ids
      .filter((id) => siteInScope(req, id))
      .map((id, i) => prisma.site.update({ where: { id }, data: { order: i } })),
  );
  res.json({ message: 'ok' });
}

export async function updateSite(req: AuthRequest, res: Response) {
  if (!siteInScope(req, req.params.id)) return res.status(404).json({ error: 'Site not found' });
  const { name, color } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;

  const site = await prisma.site.update({ where: { id: req.params.id }, data });
  await logAudit(req, 'SITE_UPDATED', site.name);
  res.json(site);
}

export async function deleteSite(req: AuthRequest, res: Response) {
  if (!siteInScope(req, req.params.id)) return res.status(404).json({ error: 'Site not found' });
  const existing = await prisma.site.findUnique({ where: { id: req.params.id }, select: { name: true } });
  // Detach patients from the site, then delete it
  await prisma.serviceUser.updateMany({ where: { siteId: req.params.id }, data: { siteId: null } });
  await prisma.site.delete({ where: { id: req.params.id } });
  if (existing) await logAudit(req, 'SITE_DELETED', existing.name);
  res.json({ message: 'Site deleted' });
}
