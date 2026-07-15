import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// GET /api/service-plan-template — the company's saved template, or null when
// none has been customised yet (the frontend then uses the built-in default).
export async function getServicePlanTemplate(_req: AuthRequest, res: Response) {
  const tpl = await prisma.servicePlanTemplate.findFirst();
  if (!tpl) return res.json({ sections: null });
  let sections: unknown = null;
  try { sections = JSON.parse(tpl.sections); } catch { sections = null; }
  res.json({ sections, updatedAt: tpl.updatedAt });
}

// PUT /api/service-plan-template — replace the company's template. Body:
// { sections: [...] }. One row per company (findFirst then update/create so we
// don't depend on upsert behaviour under the tenant extension).
export async function saveServicePlanTemplate(req: AuthRequest, res: Response) {
  const { sections } = req.body as { sections?: unknown };
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'sections must be an array' });

  const serialised = JSON.stringify(sections);
  const existing = await prisma.servicePlanTemplate.findFirst();
  const saved = existing
    ? await prisma.servicePlanTemplate.update({ where: { id: existing.id }, data: { sections: serialised, updatedById: req.user!.id } })
    : await prisma.servicePlanTemplate.create({ data: { sections: serialised, updatedById: req.user!.id } });

  let parsed: unknown = sections;
  try { parsed = JSON.parse(saved.sections); } catch { /* keep as-is */ }
  res.json({ sections: parsed, updatedAt: saved.updatedAt });
}

// DELETE /api/service-plan-template — reset to the built-in default (removes the
// company's customisation so the frontend falls back to the default template).
export async function resetServicePlanTemplate(_req: AuthRequest, res: Response) {
  const existing = await prisma.servicePlanTemplate.findFirst();
  if (existing) await prisma.servicePlanTemplate.delete({ where: { id: existing.id } });
  res.json({ sections: null });
}
