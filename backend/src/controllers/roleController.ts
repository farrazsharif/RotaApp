import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { sanitiseCapabilityList } from '../middleware/permissions';
import { logAudit } from '../lib/audit';

const BASE_TYPES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE', 'FAMILY_MEMBER'];

function shape(r: { id: string; name: string; baseType: string; permissions: string; _count?: { users: number } }) {
  let permissions: string[] = [];
  try { permissions = JSON.parse(r.permissions); } catch { permissions = []; }
  return { id: r.id, name: r.name, baseType: r.baseType, permissions, userCount: r._count?.users ?? 0 };
}

export async function listRoles(_req: AuthRequest, res: Response) {
  const roles = await prisma.customRole.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(roles.map(shape));
}

export async function createRole(req: AuthRequest, res: Response) {
  const { name, baseType, permissions } = req.body as { name?: string; baseType?: string; permissions?: unknown };
  if (!name || !name.trim()) return res.status(400).json({ error: 'Role name required' });
  const base = BASE_TYPES.includes(baseType as Role) ? (baseType as Role) : 'EMPLOYEE';

  // Auto-scoped to the current company by the tenant extension.
  const existing = await prisma.customRole.findFirst({ where: { name: name.trim() } });
  if (existing) return res.status(409).json({ error: 'A role with that name already exists' });

  const role = await prisma.customRole.create({
    data: { name: name.trim(), baseType: base, permissions: JSON.stringify(sanitiseCapabilityList(permissions)) },
    include: { _count: { select: { users: true } } },
  });
  await logAudit(req, 'ROLE_CREATED', role.name);
  res.status(201).json(shape(role));
}

export async function updateRole(req: AuthRequest, res: Response) {
  const { name, baseType, permissions } = req.body as { name?: string; baseType?: string; permissions?: unknown };
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Role name required' });
    data.name = name.trim();
  }
  if (baseType !== undefined && BASE_TYPES.includes(baseType as Role)) data.baseType = baseType;
  if (permissions !== undefined) data.permissions = JSON.stringify(sanitiseCapabilityList(permissions));

  try {
    const role = await prisma.customRole.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { users: true } } },
    });
    // If the role's base type changed, keep assigned users' base role in sync.
    if (data.baseType) {
      await prisma.user.updateMany({ where: { customRoleId: role.id }, data: { role: role.baseType } });
    }
    await logAudit(req, 'ROLE_UPDATED', role.name, Object.keys(data).join(', '));
    res.json(shape(role));
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') return res.status(409).json({ error: 'A role with that name already exists' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Role not found' });
    throw err;
  }
}

export async function deleteRole(req: AuthRequest, res: Response) {
  // Users referencing this role are detached automatically (onDelete: SetNull),
  // reverting them to their base account type.
  const role = await prisma.customRole.findUnique({ where: { id: req.params.id }, select: { name: true } });
  await prisma.customRole.delete({ where: { id: req.params.id } });
  await logAudit(req, 'ROLE_DELETED', role?.name || req.params.id);
  res.json({ message: 'Role deleted' });
}
