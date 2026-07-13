import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ServiceUserStatus } from '../constants';
import { isScoped, serviceUserInScope } from '../lib/scope';
import { emitToUser } from '../lib/socket';
import { sendPushToUser } from '../lib/push';

const include = {
  preferredCaregivers: { select: { id: true, firstName: true, lastName: true } },
  site: { select: { id: true, name: true, color: true } },
};

export async function listServiceUsers(req: AuthRequest, res: Response) {
  const { search, active, siteId, status } = req.query;
  const where: Record<string, unknown> = {};
  if (active !== undefined) where.active = active === 'true';
  if (siteId) where.siteId = siteId;
  if (status) where.status = String(status);

  if (search) {
    const term = String(search).trim();
    // Case-insensitive so "adrienne" matches "Adrienne". Also split on spaces so
    // a full name ("Adrienne Staines") matches across first + last name.
    const parts = term.split(/\s+/).filter(Boolean);
    where.AND = parts.map((p) => ({
      OR: [
        { firstName: { contains: p, mode: 'insensitive' } },
        { lastName: { contains: p, mode: 'insensitive' } },
        { postcode: { contains: p, mode: 'insensitive' } },
      ],
    }));
  }

  // Restrict to the caller's sites when scoped.
  if (isScoped(req.user)) {
    const scope = req.user!.siteIds!;
    if (typeof where.siteId === 'string') {
      if (!scope.includes(where.siteId)) return res.json([]);
    } else {
      where.siteId = { in: scope };
    }
  }

  const users = await prisma.serviceUser.findMany({
    where,
    include,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(users);
}

export async function getServiceUser(req: AuthRequest, res: Response) {
  if (!(await serviceUserInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  const user = await prisma.serviceUser.findUnique({ where: { id: req.params.id }, include });
  if (!user) return res.status(404).json({ error: 'Service user not found' });
  res.json(user);
}

// Ensures a scoped caller may create/move a service user into the given site.
function siteAllowed(req: AuthRequest, siteId: unknown): boolean {
  if (!isScoped(req.user)) return true;
  return typeof siteId === 'string' && req.user!.siteIds!.includes(siteId);
}

function buildData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const stringFields = [
    'firstName', 'lastName', 'preferredName', 'gender', 'ethnicOrigin', 'nhsNumber', 'packageId', 'address', 'postcode', 'keySafe', 'medsSafeCode', 'phone', 'email', 'photo',
    'emergencyContactName', 'emergencyContactPhone', 'emergencyContactMobile', 'emergencyContactAddress', 'emergencyContactRelation',
    'nextOfKinName', 'nextOfKinPhone', 'nextOfKinMobile', 'nextOfKinAddress', 'nextOfKinRelation', 'careNotes',
    'gpName', 'gpPractice', 'gpPhone', 'gpAddress',
    'pharmacyName', 'pharmacyPhone', 'pharmacyAddress',
  ];
  for (const f of stringFields) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.dateOfBirth !== undefined) data.dateOfBirth = new Date(body.dateOfBirth as string);
  if (body.serviceStartDate !== undefined) data.serviceStartDate = body.serviceStartDate ? new Date(body.serviceStartDate as string) : null;
  if (body.needsMedication !== undefined) data.needsMedication = !!body.needsMedication;
  if (body.needsMobility !== undefined) data.needsMobility = !!body.needsMobility;
  if (body.needsPersonalCare !== undefined) data.needsPersonalCare = !!body.needsPersonalCare;
  if (body.visitDuration !== undefined) data.visitDuration = Number(body.visitDuration) || 30;
  if (body.visits !== undefined) {
    const raw = typeof body.visits === 'string' ? body.visits : JSON.stringify(body.visits);
    try { JSON.parse(raw); data.visits = raw; } catch { /* ignore invalid */ }
  }
  if (body.supportCategories !== undefined) {
    const raw = typeof body.supportCategories === 'string' ? body.supportCategories : JSON.stringify(body.supportCategories);
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) data.supportCategories = JSON.stringify(arr.filter((x) => typeof x === 'string'));
    } catch { /* ignore invalid */ }
  }
  if (body.active !== undefined) data.active = !!body.active;
  if (body.siteId !== undefined) data.siteId = body.siteId || null;
  if (body.status !== undefined && Object.values(ServiceUserStatus).includes(body.status as ServiceUserStatus)) {
    data.status = body.status;
  }
  return data;
}

export async function createServiceUser(req: AuthRequest, res: Response) {
  const { firstName, lastName, dateOfBirth, preferredCaregiverIds } = req.body;
  if (!firstName || !lastName || !dateOfBirth) {
    return res.status(400).json({ error: 'firstName, lastName, dateOfBirth required' });
  }

  const data = buildData(req.body);
  // firstName/lastName/dateOfBirth are required on create
  data.firstName = firstName;
  data.lastName = lastName;
  data.dateOfBirth = new Date(dateOfBirth);

  // A scoped user can only create service users within one of their sites.
  if (!siteAllowed(req, data.siteId)) {
    return res.status(403).json({ error: 'You must assign this person to one of your sites' });
  }

  if (Array.isArray(preferredCaregiverIds)) {
    data.preferredCaregivers = { connect: preferredCaregiverIds.map((id: string) => ({ id })) };
  }

  const user = await prisma.serviceUser.create({ data: data as never, include });
  res.status(201).json(user);
}

export async function updateServiceUser(req: AuthRequest, res: Response) {
  if (!(await serviceUserInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  const { preferredCaregiverIds } = req.body;
  const data = buildData(req.body);

  // Prevent moving a service user out of the caller's sites.
  if (data.siteId !== undefined && !siteAllowed(req, data.siteId)) {
    return res.status(403).json({ error: 'You can only assign this person to one of your sites' });
  }

  if (Array.isArray(preferredCaregiverIds)) {
    data.preferredCaregivers = { set: preferredCaregiverIds.map((id: string) => ({ id })) };
  }

  // When the status actually changes, record it on the status timeline and
  // stamp statusUpdatedAt with the moment of change. Each shift then resolves
  // the status that was in effect at its own date+time — so a change made at,
  // say, 3pm only affects that afternoon's calls onward, and the window a
  // patient was hospitalised keeps showing it even after they return to active.
  if (data.status !== undefined) {
    const existing = await prisma.serviceUser.findUnique({
      where: { id: req.params.id },
      select: { status: true, statusUpdatedAt: true, firstName: true, lastName: true, _count: { select: { statusChanges: true } } },
    });
    if (existing && existing.status !== data.status) {
      // Effective moment defaults to now, but a manager may back-date it — e.g.
      // recording that the patient actually went to hospital earlier today.
      const parsed = req.body.statusEffectiveAt ? new Date(String(req.body.statusEffectiveAt)) : null;
      const effectiveAt = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
      data.statusUpdatedAt = effectiveAt;
      // First change since this feature shipped: seed a baseline entry for the
      // status they were already in, so shifts before now still resolve to it.
      if (existing._count.statusChanges === 0 && existing.status !== ServiceUserStatus.ACTIVE) {
        await prisma.serviceUserStatusChange.create({
          data: { serviceUserId: req.params.id, status: existing.status, effectiveAt: existing.statusUpdatedAt },
        });
      }
      await prisma.serviceUserStatusChange.create({
        data: { serviceUserId: req.params.id, status: String(data.status), effectiveAt, changedById: req.user?.id ?? null },
      });

      // When a service user passes away, take their upcoming calls off the
      // schedule automatically — cancel every not-already-cancelled shift that
      // starts at or after the effective moment (calls earlier that day already
      // happened, so they're left intact).
      if (data.status === ServiceUserStatus.DECEASED) {
        const dayStart = new Date(effectiveAt.getFullYear(), effectiveAt.getMonth(), effectiveAt.getDate(), 0, 0, 0);
        const candidates = await prisma.shift.findMany({
          where: { serviceUserId: req.params.id, status: { not: 'CANCELLED' }, date: { gte: dayStart } },
          select: { id: true, date: true, startTime: true, userId: true, coverCarers: { select: { id: true } } },
        });
        const cancelled = candidates.filter((s) => {
          const [h, m] = s.startTime.split(':').map(Number);
          const d = new Date(s.date);
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0, 0);
          return start >= effectiveAt;
        });
        if (cancelled.length > 0) {
          await prisma.shift.updateMany({ where: { id: { in: cancelled.map((s) => s.id) } }, data: { status: 'CANCELLED' } });

          // Tell each affected carer their upcoming visits were cancelled — one
          // grouped notification per carer rather than one per shift.
          const perCarer = new Map<string, number>();
          for (const s of cancelled) {
            for (const carerId of [s.userId, ...s.coverCarers.map((c) => c.id)].filter(Boolean) as string[]) {
              perCarer.set(carerId, (perCarer.get(carerId) ?? 0) + 1);
            }
          }
          const patientName = existing ? `${existing.firstName} ${existing.lastName}` : 'a service user';
          await Promise.all(
            [...perCarer.entries()].map(async ([carerId, count]) => {
              const message = `${count} upcoming visit${count > 1 ? 's' : ''} for ${patientName} ${count > 1 ? 'have' : 'has'} been cancelled.`;
              const notification = await prisma.notification.create({
                data: { userId: carerId, type: 'SHIFT_REMOVED', title: 'Visits Cancelled', message, data: JSON.stringify({ serviceUserId: req.params.id }) },
              });
              emitToUser(carerId, 'notification', notification);
              await sendPushToUser(carerId, { title: 'Visits Cancelled', body: message });
            }),
          );
        }
      }
    }
  }

  const user = await prisma.serviceUser.update({ where: { id: req.params.id }, data: data as never, include });
  res.json(user);
}

export async function deleteServiceUser(req: AuthRequest, res: Response) {
  if (!(await serviceUserInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  await prisma.serviceUser.delete({ where: { id: req.params.id } });
  res.json({ message: 'Service user deleted' });
}
