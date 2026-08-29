import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { MedStatus } from '../constants';
import { relatedServiceUserScopeWhere } from '../lib/scope';
import { logAudit } from '../lib/audit';
import { ownerShiftIdForDose } from '../lib/doseOwnership';

// Human-readable status words for audit details (matches the portal labels).
const STATUS_WORD: Record<string, string> = {
  GIVEN: 'Administered', REFUSED: 'Refused', MISSED: 'Absent', NOT_NEEDED: 'Not Required', SELF_ADMIN: 'Self-administered', CANCELLED: 'Cancelled',
};

// "for <patient name>" suffix for a medication audit entry, or undefined.
async function forPatient(serviceUserId: string | null | undefined): Promise<string | undefined> {
  if (!serviceUserId) return undefined;
  const su = await prisma.serviceUser.findUnique({ where: { id: serviceUserId }, select: { firstName: true, lastName: true } });
  return su ? `for ${su.firstName} ${su.lastName}` : undefined;
}

function parseTimes(input: unknown): string {
  if (Array.isArray(input)) return JSON.stringify(input.filter((t) => typeof t === 'string'));
  if (typeof input === 'string') {
    // allow comma-separated "08:00, 20:00"
    const arr = input.split(',').map((s) => s.trim()).filter(Boolean);
    return JSON.stringify(arr);
  }
  return '[]';
}

// Weekday schedule → JSON array of unique 0-6 ints (0=Sun). Empty = every day.
function parseDays(input: unknown): string {
  if (!Array.isArray(input)) return '[]';
  const days = [...new Set(input.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  return JSON.stringify(days);
}

const VALID_VIEWS = ['front', 'back'];

function parseApplicationSites(input: unknown): string {
  if (!Array.isArray(input)) return '[]';
  const sites = input
    .filter((p): p is { view: string; x: number; y: number } =>
      !!p && VALID_VIEWS.includes(p.view) && typeof p.x === 'number' && typeof p.y === 'number'
    )
    .map((p) => ({ view: p.view, x: p.x, y: p.y, label: typeof (p as { label?: unknown }).label === 'string' ? (p as { label?: string }).label : undefined }));
  return JSON.stringify(sites);
}

export async function listMedications(req: AuthRequest, res: Response) {
  const { serviceUserId, includeInactive } = req.query;
  if (!serviceUserId) return res.status(400).json({ error: 'serviceUserId required' });
  // The MAR chart passes includeInactive=true so discontinued meds still show
  // their history (the weeks they were given) alongside the discontinue date.
  // Everywhere else (eMAR, med lists) keeps showing only active meds.
  const where: Record<string, unknown> = { serviceUserId: String(serviceUserId) };
  if (String(includeInactive) !== 'true') where.active = true;
  const meds = await prisma.medication.findMany({ where, orderBy: { name: 'asc' } });
  res.json(meds);
}

export async function createMedication(req: AuthRequest, res: Response) {
  const { serviceUserId, name, dose, route, instructions, times, daysOfWeek, startDate, endDate, applicationSites, isBlisterPack, packContents } = req.body;
  if (!serviceUserId || !name) return res.status(400).json({ error: 'serviceUserId and name required' });
  const med = await prisma.medication.create({
    data: {
      serviceUserId,
      name,
      dose: dose || null,
      route: route || null,
      instructions: instructions || null,
      isBlisterPack: !!isBlisterPack,
      packContents: packContents ? String(packContents) : null,
      times: parseTimes(times),
      daysOfWeek: parseDays(daysOfWeek),
      applicationSites: parseApplicationSites(applicationSites),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  await logAudit(req, 'MEDICATION_ADDED', name, await forPatient(serviceUserId));
  res.status(201).json(med);
}

// Carer-added short-course medication (e.g. a GP prescribes antibiotics for a
// week). Same as createMedication but reachable without manage_medications —
// the scope middleware still confines it to the carer's own clients, and it's
// audited so it's clear a carer added it directly on a visit.
export async function createMedicationByCarer(req: AuthRequest, res: Response) {
  const { serviceUserId, name, dose, route, instructions, times, startDate, endDate } = req.body;
  if (!serviceUserId || !name) return res.status(400).json({ error: 'serviceUserId and name required' });
  const med = await prisma.medication.create({
    data: {
      serviceUserId,
      name,
      dose: dose || null,
      route: route || null,
      instructions: instructions || null,
      times: parseTimes(times),
      applicationSites: '[]',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  await logAudit(req, 'MEDICATION_ADDED_BY_CARER', name, await forPatient(serviceUserId));
  res.status(201).json(med);
}

export async function updateMedication(req: AuthRequest, res: Response) {
  const { name, dose, route, instructions, times, daysOfWeek, startDate, endDate, active, applicationSites, isBlisterPack, packContents } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (dose !== undefined) data.dose = dose || null;
  if (route !== undefined) data.route = route || null;
  if (instructions !== undefined) data.instructions = instructions || null;
  if (isBlisterPack !== undefined) data.isBlisterPack = !!isBlisterPack;
  if (packContents !== undefined) data.packContents = packContents ? String(packContents) : null;
  if (times !== undefined) data.times = parseTimes(times);
  if (daysOfWeek !== undefined) data.daysOfWeek = parseDays(daysOfWeek);
  if (applicationSites !== undefined) data.applicationSites = parseApplicationSites(applicationSites);
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (active !== undefined) data.active = !!active;
  const med = await prisma.medication.update({ where: { id: req.params.id }, data });
  await logAudit(req, 'MEDICATION_UPDATED', med.name, await forPatient(med.serviceUserId));
  res.json(med);
}

export async function deleteMedication(req: AuthRequest, res: Response) {
  const med = await prisma.medication.findUnique({ where: { id: req.params.id }, select: { name: true, serviceUserId: true, endDate: true } });
  // Discontinue = soft-delete (keeps the administration history) and stamp the
  // discontinue date so the MAR chart shows it was given up to today, then ends.
  const today = new Date();
  const endDate = !med?.endDate || med.endDate > today ? today : med.endDate;
  await prisma.medication.update({ where: { id: req.params.id }, data: { active: false, endDate } });
  if (med) await logAudit(req, 'MEDICATION_DISCONTINUED', med.name, await forPatient(med.serviceUserId));
  res.json({ message: 'Medication discontinued' });
}

const adminInclude = {
  user: { select: { id: true, firstName: true, lastName: true } },
  medication: { select: { id: true, name: true, dose: true, route: true } },
  serviceUser: { select: { id: true, firstName: true, lastName: true } },
};

export async function listAdministrations(req: AuthRequest, res: Response) {
  const { serviceUserId, date, startDate, endDate, recent, status } = req.query;
  const where: Record<string, unknown> = {};
  if (serviceUserId) where.serviceUserId = String(serviceUserId);
  if (status && Object.values(MedStatus).includes(String(status) as MedStatus)) where.status = String(status);
  Object.assign(where, relatedServiceUserScopeWhere(req.user));
  if (date) {
    const [y, m, d] = String(date).split('-').map(Number);
    where.scheduledFor = { gte: new Date(y, m - 1, d, 0, 0, 0), lte: new Date(y, m - 1, d, 23, 59, 59) };
  } else if (startDate || endDate) {
    const range: Record<string, Date> = {};
    if (startDate) {
      const [y, m, d] = String(startDate).split('-').map(Number);
      range.gte = new Date(y, m - 1, d, 0, 0, 0);
    }
    if (endDate) {
      const [y, m, d] = String(endDate).split('-').map(Number);
      range.lte = new Date(y, m - 1, d, 23, 59, 59);
    }
    where.scheduledFor = range;
  }
  const records = await prisma.medAdministration.findMany({
    where,
    include: adminInclude,
    orderBy: serviceUserId && date ? { scheduledFor: 'asc' } : { recordedAt: 'desc' },
    take: recent ? Number(recent) || 100 : undefined,
  });
  res.json(records);
}

// Dose slots (medication + scheduled time) whose visit was CANCELLED and which
// no active visit that day absorbs — so the MAR chart can mark them "C" instead
// of leaving a blank that reads as "not recorded". Read-only; computed live from
// the schedule, so un-cancelling a visit clears the C automatically.
export async function cancelledDoses(req: AuthRequest, res: Response) {
  const { serviceUserId, startDate, endDate } = req.query as { serviceUserId?: string; startDate?: string; endDate?: string };
  if (!serviceUserId || !startDate || !endDate) return res.json([]);
  const [sy, sm, sd] = String(startDate).split('-').map(Number);
  const [ey, em, ed] = String(endDate).split('-').map(Number);
  const rangeStart = new Date(sy, sm - 1, sd, 0, 0, 0);
  const rangeEnd = new Date(ey, em - 1, ed, 23, 59, 59);

  const meds = await prisma.medication.findMany({
    where: { serviceUserId: String(serviceUserId), active: true, ...relatedServiceUserScopeWhere(req.user) },
    select: { id: true, times: true, daysOfWeek: true, startDate: true, endDate: true },
  });
  if (meds.length === 0) return res.json([]);

  const shifts = await prisma.shift.findMany({
    where: { serviceUserId: String(serviceUserId), date: { gte: rangeStart, lt: new Date(rangeEnd.getTime() + 1000) } },
    select: { id: true, startTime: true, endTime: true, date: true, status: true, givesMedication: true },
  });
  // Group visits by their calendar day (UTC, matching how dose slots are keyed).
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = `${s.date.getUTCFullYear()}-${s.date.getUTCMonth()}-${s.date.getUTCDate()}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s);
  }

  const out: { medicationId: string; scheduledFor: string }[] = [];
  for (let dt = new Date(rangeStart); dt <= rangeEnd; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear(), m0 = dt.getMonth(), d = dt.getDate();
    const dayKey = `${y}-${m0}-${d}`;
    const dayShifts = (byDay.get(dayKey) ?? []).filter((s) => s.givesMedication !== false);
    if (dayShifts.length === 0) continue; // no visits that day → nothing was cancelled
    const active = dayShifts.filter((s) => s.status !== 'CANCELLED');
    const dow = new Date(Date.UTC(y, m0, d)).getUTCDay();
    const ymd = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    for (const med of meds) {
      const startYmd = med.startDate ? med.startDate.toISOString().slice(0, 10) : null;
      const endYmd = med.endDate ? med.endDate.toISOString().slice(0, 10) : null;
      if (startYmd && ymd < startYmd) continue;
      if (endYmd && ymd > endYmd) continue;
      let days: number[] = [];
      try { days = JSON.parse((med.daysOfWeek as string) || '[]'); } catch { days = []; }
      if (days.length > 0 && !days.includes(dow)) continue;
      let times: string[] = [];
      try { times = JSON.parse(med.times || '[]'); } catch { times = []; }

      for (const t of times) {
        // If an active visit absorbs the dose it isn't cancelled — it moved to
        // that visit. Only when no active visit owns it and a cancelled one would
        // have is the dose genuinely cancelled.
        if (ownerShiftIdForDose(active, t)) continue;
        const ownerId = ownerShiftIdForDose(dayShifts, t);
        const owner = ownerId ? dayShifts.find((s) => s.id === ownerId) : null;
        if (owner && owner.status === 'CANCELLED') {
          const [h, mi] = t.split(':').map(Number);
          out.push({ medicationId: med.id, scheduledFor: new Date(Date.UTC(y, m0, d, h, mi, 0)).toISOString() });
        }
      }
    }
  }
  res.json(out);
}

export async function recordAdministration(req: AuthRequest, res: Response) {
  const { medicationId, serviceUserId, scheduledFor, status, note } = req.body;
  if (!medicationId || !serviceUserId || !scheduledFor || !status) {
    return res.status(400).json({ error: 'medicationId, serviceUserId, scheduledFor, status required' });
  }
  if (!Object.values(MedStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const when = new Date(scheduledFor);
  const record = await prisma.medAdministration.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    update: { status, note: note || null, userId: req.user!.id, recordedAt: new Date() },
    create: { medicationId, serviceUserId, scheduledFor: when, status, note: note || null, userId: req.user!.id },
    include: adminInclude,
  });
  res.status(201).json(record);
}

// Office record/correction from the portal — used when a carer was offline and
// their entry never reached us, or to fix a wrong one. Unlike the carer path it
// can attribute the dose to the carer who actually gave it and set the real
// time given, and every change is audited (a MAR is a legal document). Keyed on
// medication + scheduled slot, so it both creates a missing record and edits an
// existing one.
export async function recordAdministrationByManager(req: AuthRequest, res: Response) {
  const { medicationId, serviceUserId, scheduledFor, status, note, userId, recordedAt } = req.body as {
    medicationId?: string; serviceUserId?: string; scheduledFor?: string; status?: string;
    note?: string; userId?: string | null; recordedAt?: string;
  };
  if (!medicationId || !serviceUserId || !scheduledFor || !status) {
    return res.status(400).json({ error: 'medicationId, serviceUserId, scheduledFor, status required' });
  }
  if (!Object.values(MedStatus).includes(status as MedStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  // Attribute to the named carer if given (and only if they're a real user);
  // null clears it. When omitted, fall back to the office user recording it.
  let carerId: string | null = req.user!.id;
  if (userId === null) carerId = null;
  else if (userId) {
    const carer = await prisma.user.findFirst({ where: { id: userId }, select: { id: true } });
    if (!carer) return res.status(400).json({ error: 'Selected carer not found' });
    carerId = carer.id;
  }
  const when = new Date(scheduledFor);
  const recAt = recordedAt ? new Date(recordedAt) : new Date();
  const existing = await prisma.medAdministration.findUnique({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    select: { id: true },
  });
  const record = await prisma.medAdministration.upsert({
    where: { medicationId_scheduledFor: { medicationId, scheduledFor: when } },
    update: { status, note: note || null, userId: carerId, recordedAt: recAt },
    create: { medicationId, serviceUserId, scheduledFor: when, status, note: note || null, userId: carerId, recordedAt: recAt },
    include: adminInclude,
  });
  await logAudit(
    req,
    existing ? 'MED_ADMIN_EDITED' : 'MED_ADMIN_RECORDED',
    `${record.medication.name} @ ${when.toISOString().slice(0, 16).replace('T', ' ')}`,
    `${STATUS_WORD[status as MedStatus] || status}${(await forPatient(serviceUserId)) || ''}`,
  );
  res.status(existing ? 200 : 201).json(record);
}
