import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { ServiceUserStatus } from '../constants';
import { isScoped, serviceUserInScope } from '../lib/scope';
import { emitToUser, emitToCompany } from '../lib/socket';
import { sendPushToUser } from '../lib/push';
import { logAudit } from '../lib/audit';
import { cancelAwayWindow, restoreAwayVisits } from '../lib/awayPeriods';

// Turn a camelCase field name into readable words for the audit details,
// e.g. "emergencyContactPhone" → "emergency contact phone".
const prettyField = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^\s/, '').toLowerCase();

// The scalar fields that actually changed between the stored record and the
// update payload, so the audit entry says what was edited (not every field the
// form re-submitted). Relations and internally-derived fields are ignored.
function changedFields(original: Record<string, unknown>, data: Record<string, unknown>): string[] {
  const skip = new Set(['preferredCaregivers', 'statusUpdatedAt']);
  const changed: string[] = [];
  for (const key of Object.keys(data)) {
    if (skip.has(key)) continue;
    let a: unknown = original[key];
    let b: unknown = data[key];
    if (a instanceof Date) a = a.getTime();
    if (b instanceof Date) b = b.getTime();
    if (a === undefined) a = null;
    if (a !== b) changed.push(key);
  }
  return changed;
}

const include = {
  preferredCaregivers: { select: { id: true, firstName: true, lastName: true } },
  site: { select: { id: true, name: true, color: true, supportedLiving: true, housingProvider: true, housingOfficerName: true, housingOfficerPhone: true, housingOfficerEmail: true } },
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
    'firstName', 'lastName', 'title', 'preferredName', 'gender', 'ethnicOrigin', 'nhsNumber', 'packageId', 'grabSheet', 'address', 'postcode', 'keySafe', 'medsSafeCode', 'phone', 'email', 'photo',
    'emergencyContactName', 'emergencyContactPhone', 'emergencyContactMobile', 'emergencyContactAddress', 'emergencyContactRelation', 'emergencyContactEmail',
    'nextOfKinName', 'nextOfKinPhone', 'nextOfKinMobile', 'nextOfKinAddress', 'nextOfKinRelation', 'nextOfKinEmail', 'careNotes',
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
  if (body.contractedWeeklyHours !== undefined) {
    const n = Number(body.contractedWeeklyHours);
    data.contractedWeeklyHours = body.contractedWeeklyHours === '' || body.contractedWeeklyHours === null || isNaN(n) ? null : n;
  }
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

// Supported-living is driven by the site: a client on a supported-living scheme
// is supported-living. Returns the careType a given site implies.
async function careTypeForSite(siteId: unknown): Promise<'SUPPORTED_LIVING' | 'DOMICILIARY'> {
  if (!siteId || typeof siteId !== 'string') return 'DOMICILIARY';
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { supportedLiving: true } });
  return site?.supportedLiving ? 'SUPPORTED_LIVING' : 'DOMICILIARY';
}

export async function createServiceUser(req: AuthRequest, res: Response) {
  const { firstName, lastName, dateOfBirth, preferredCaregiverIds } = req.body;
  if (!firstName || !lastName || !dateOfBirth) {
    return res.status(400).json({ error: 'firstName, lastName, dateOfBirth required' });
  }

  const data = buildData(req.body);
  data.careType = await careTypeForSite(data.siteId);
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
  await logAudit(req, 'SERVICE_USER_CREATED', `${firstName} ${lastName}`, 'New service user added');
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
  // Re-derive supported-living status only when the site actually changes — the
  // form always sends siteId, so editing other fields must never flip an
  // existing client's status.
  if (data.siteId !== undefined) {
    const cur = await prisma.serviceUser.findUnique({ where: { id: req.params.id }, select: { siteId: true } });
    if (!cur || cur.siteId !== data.siteId) {
      data.careType = await careTypeForSite(data.siteId);
    }
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
      select: { status: true, statusUpdatedAt: true, firstName: true, lastName: true, companyId: true, _count: { select: { statusChanges: true } } },
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

      // When a service user is discharged (care ended) or passes away, take
      // their upcoming calls off the schedule automatically — cancel every
      // not-already-cancelled shift that starts at or after the effective moment
      // (calls earlier that day already happened, so they're left intact).
      if (data.status === ServiceUserStatus.DECEASED || data.status === ServiceUserStatus.DISCHARGED) {
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
          if (existing?.companyId) emitToCompany(existing.companyId, 'data:changed', { resource: '/api/shifts' });
        }
      }

      // Hospital admission: cancel the client's visits until an expected return
      // date (non-chargeable) and notify carers. Reuses the away-period engine
      // (RespitePeriod type=HOSPITAL) so the return date can later be extended
      // or reduced, and the top-up won't regenerate visits during the stay.
      if (data.status === ServiceUserStatus.HOSPITALISED) {
        const rr = req.body.hospitalReturnDate ? new Date(String(req.body.hospitalReturnDate)) : null;
        const returnAt = rr && !isNaN(rr.getTime()) && rr > effectiveAt ? rr : null;
        if (returnAt) {
          const patientName = `${existing.firstName} ${existing.lastName}`;
          const cancelledIds = await cancelAwayWindow(req.params.id, effectiveAt, returnAt, {
            reason: 'Hospital admission', patientName, awayLabel: 'in hospital', notify: true,
          });
          const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { firstName: true, lastName: true, email: true } });
          const createdByName = author ? `${author.firstName} ${author.lastName}`.trim() || author.email : (req.user!.email ?? 'Unknown');
          await prisma.respitePeriod.create({
            data: {
              serviceUserId: req.params.id, startAt: effectiveAt, endAt: returnAt, type: 'HOSPITAL',
              note: 'Hospital admission', cancelledShiftIds: JSON.stringify(cancelledIds), cancelledCount: cancelledIds.length,
              createdById: req.user?.id ?? null, createdByName,
            },
          });
          if (existing.companyId) emitToCompany(existing.companyId, 'data:changed', { resource: '/api/shifts' });
        }
      }

      // Leaving hospital back to care (e.g. Active / On hold): end any open
      // hospital period as of now and restore the visits it cancelled from now
      // onward. Skipped for Discharged/Deceased — there, care has ended, so the
      // visits stay cancelled (handled above) rather than being restored.
      if (existing.status === ServiceUserStatus.HOSPITALISED
        && data.status !== ServiceUserStatus.HOSPITALISED
        && data.status !== ServiceUserStatus.DECEASED
        && data.status !== ServiceUserStatus.DISCHARGED) {
        const active = await prisma.respitePeriod.findFirst({
          where: { serviceUserId: req.params.id, type: 'HOSPITAL', endAt: { gt: effectiveAt } },
          orderBy: { startAt: 'desc' },
        });
        if (active) {
          let ids: string[] = [];
          try { ids = JSON.parse(active.cancelledShiftIds || '[]'); } catch { ids = []; }
          const patientName = `${existing.firstName} ${existing.lastName}`;
          const restored = await restoreAwayVisits(ids, effectiveAt, { patientName, resumeLabel: 'back from hospital', notify: true });
          const restoredSet = new Set(restored);
          const remaining = ids.filter((idv) => !restoredSet.has(idv));
          await prisma.respitePeriod.update({ where: { id: active.id }, data: { endAt: effectiveAt, cancelledShiftIds: JSON.stringify(remaining), cancelledCount: remaining.length } });
          if (existing.companyId) emitToCompany(existing.companyId, 'data:changed', { resource: '/api/shifts' });
        }
      }

      // Discharged/deceased straight from hospital: close any open hospital
      // period so the "in hospital" banner clears and the top-up's respite skip
      // doesn't linger (the visits it cancelled stay cancelled — care has ended).
      if ((data.status === ServiceUserStatus.DISCHARGED || data.status === ServiceUserStatus.DECEASED)
        && existing.status === ServiceUserStatus.HOSPITALISED) {
        await prisma.respitePeriod.updateMany({
          where: { serviceUserId: req.params.id, type: 'HOSPITAL', endAt: { gt: effectiveAt } },
          data: { endAt: effectiveAt },
        });
      }
    }
  }

  const original = await prisma.serviceUser.findUnique({ where: { id: req.params.id } });
  const user = await prisma.serviceUser.update({ where: { id: req.params.id }, data: data as never, include });

  // Record what actually changed, so the audit log shows who edited which fields.
  if (original) {
    const changed = changedFields(original as unknown as Record<string, unknown>, data);
    if (changed.length > 0) {
      const statusChanged = changed.includes('status');
      const others = changed.filter((k) => k !== 'status').map(prettyField);
      const details = [
        statusChanged ? `status → ${String(data.status)}` : null,
        others.length ? `changed: ${others.join(', ')}` : null,
      ].filter(Boolean).join('; ');
      await logAudit(req, 'SERVICE_USER_UPDATED', `${original.firstName} ${original.lastName}`, details || 'updated');
    }
  }
  res.json(user);
}

export async function deleteServiceUser(req: AuthRequest, res: Response) {
  if (!(await serviceUserInScope(req.user, req.params.id))) {
    return res.status(404).json({ error: 'Service user not found' });
  }
  const existing = await prisma.serviceUser.findUnique({ where: { id: req.params.id }, select: { firstName: true, lastName: true } });
  await prisma.serviceUser.delete({ where: { id: req.params.id } });
  if (existing) await logAudit(req, 'SERVICE_USER_DELETED', `${existing.firstName} ${existing.lastName}`, 'Service user deleted');
  res.json({ message: 'Service user deleted' });
}
