import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '../constants';
import { logAudit } from '../lib/audit';
import { ensureTrainingCourses } from './settingsController';

export async function listTraining(req: AuthRequest, res: Response) {
  // Carers can only ever see their own training record; managers/admins can
  // view anyone's by passing ?userId=, or everyone's by omitting it.
  const isStaffSelf = req.user!.role === Role.EMPLOYEE;
  const userId = isStaffSelf ? req.user!.id : (req.query.userId as string | undefined);

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;

  const records = await prisma.training.findMany({
    where,
    orderBy: { date: 'desc' },
  });
  res.json(records);
}

export async function createTraining(req: AuthRequest, res: Response) {
  const { userId, course, date, expiresAt, accredited, description } = req.body;
  if (!userId || !course || !date) {
    return res.status(400).json({ error: 'userId, course, and date are required' });
  }

  const record = await prisma.training.create({
    data: {
      userId,
      course: String(course),
      date: new Date(date),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      accredited: !!accredited,
      description: description || null,
    },
  });
  res.status(201).json(record);
}

// Annual refresher — renews every course the staff member currently holds in
// one go: a fresh record per course dated the refresher day, expiring a year
// later, so they all read Valid again with next-year expiry dates. Keeps the
// history (new records, old ones stay) for the CQC audit trail.
export async function refreshTraining(req: AuthRequest, res: Response) {
  const { userId, date } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const when = date ? new Date(date) : new Date();
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date' });
  const expires = new Date(when);
  expires.setFullYear(expires.getFullYear() + 1);

  // The courses this person holds = the latest record per course name.
  const records = await prisma.training.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  const latestByCourse = new Map<string, (typeof records)[number]>();
  for (const r of records) if (!latestByCourse.has(r.course)) latestByCourse.set(r.course, r);

  if (latestByCourse.size === 0) {
    return res.status(400).json({ error: 'This staff member has no training courses to refresh yet. Add their courses first.' });
  }

  const created = await prisma.$transaction(
    [...latestByCourse.values()].map((r) =>
      prisma.training.create({
        data: {
          userId,
          course: r.course,
          date: when,
          expiresAt: expires,
          accredited: r.accredited,
          description: 'Annual refresher',
        },
      })
    )
  );
  res.status(201).json({ count: created.length, records: created });
}

export async function updateTraining(req: AuthRequest, res: Response) {
  const existing = await prisma.training.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Training record not found' });

  const { course, date, expiresAt, accredited, description } = req.body;
  const data: Record<string, unknown> = {};
  if (course !== undefined) data.course = String(course);
  if (date !== undefined) data.date = new Date(date);
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (accredited !== undefined) data.accredited = !!accredited;
  if (description !== undefined) data.description = description || null;

  const record = await prisma.training.update({ where: { id: req.params.id }, data });
  res.json(record);
}

export async function deleteTraining(req: AuthRequest, res: Response) {
  const existing = await prisma.training.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Training record not found' });

  await prisma.training.delete({ where: { id: req.params.id } });
  res.json({ message: 'Deleted' });
}

// ---- Matrix import ---------------------------------------------------------

// Parse an ISO date, a Date, or a UK "dd.mm.yyyy" / "dd/mm/yyyy" text date.
// Returns null for blanks, "-", or anything unparseable.
function parseTrainingDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s || s === '-') return null;
  const uk = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (uk) {
    const [, d, m, y] = uk;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface ImportRow { name: string; courses: Record<string, string> }

// Bulk import of the office training matrix. Each row is one staff member with
// a { course: date } map. Names are matched to active staff; unmatched rows are
// skipped and reported. commit=false previews; commit=true writes: for each
// (staff, course) it updates the latest existing record or creates one, with
// expiry one year on (the annual-refresher rule). Admin/manage_staff only.
export async function importTraining(req: AuthRequest, res: Response) {
  const rows = Array.isArray(req.body?.rows) ? (req.body.rows as ImportRow[]) : null;
  const commit = req.body?.commit === true;
  if (!rows) return res.status(400).json({ error: 'rows[] is required' });

  const staff = await prisma.user.findMany({
    where: { active: true, role: { not: Role.FAMILY_MEMBER } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const u of staff) {
    const key = normName(`${u.firstName} ${u.lastName}`);
    const arr = byName.get(key) ?? [];
    arr.push({ id: u.id, name: `${u.firstName} ${u.lastName}` });
    byName.set(key, arr);
  }

  const matched: { name: string; userId: string; userName: string; cells: number }[] = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const allCourses = new Set<string>();
  // Planned writes: userId -> course -> { date, expires }
  const plan: { userId: string; course: string; date: Date; expires: Date }[] = [];

  for (const row of rows) {
    const rawName = (row?.name || '').trim();
    if (!rawName) continue;
    const hits = byName.get(normName(rawName)) ?? [];
    if (hits.length === 0) { unmatched.push(rawName); continue; }
    if (hits.length > 1) { ambiguous.push(rawName); continue; }
    let cells = 0;
    for (const [course, raw] of Object.entries(row.courses || {})) {
      const name = (course || '').trim();
      if (!name) continue;
      allCourses.add(name);
      const date = parseTrainingDate(raw);
      if (!date) continue;
      const expires = new Date(date);
      expires.setFullYear(expires.getFullYear() + 1);
      plan.push({ userId: hits[0].id, course: name, date, expires });
      cells += 1;
    }
    matched.push({ name: rawName, userId: hits[0].id, userName: hits[0].name, cells });
  }

  let written = 0;
  if (commit && plan.length) {
    // Latest existing record per (user, course) — updated in place so a re-import
    // refreshes dates instead of piling duplicates.
    const existing = await prisma.training.findMany({
      where: { userId: { in: [...new Set(plan.map((p) => p.userId))] } },
      orderBy: { date: 'desc' },
      select: { id: true, userId: true, course: true },
    });
    const latestId = new Map<string, string>();
    for (const r of existing) {
      const k = `${r.userId}::${r.course.toLowerCase()}`;
      if (!latestId.has(k)) latestId.set(k, r.id);
    }
    for (const p of plan) {
      const id = latestId.get(`${p.userId}::${p.course.toLowerCase()}`);
      if (id) {
        await prisma.training.update({ where: { id }, data: { date: p.date, expiresAt: p.expires } });
      } else {
        await prisma.training.create({ data: { userId: p.userId, course: p.course, date: p.date, expiresAt: p.expires } });
      }
      written += 1;
    }
    await ensureTrainingCourses([...allCourses]);
    await logAudit(req, 'TRAINING_IMPORTED', `${matched.length} staff · ${written} records`, undefined);
  }

  res.json({
    totalRows: rows.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    ambiguousCount: ambiguous.length,
    cellCount: plan.length,
    courses: [...allCourses],
    matched, unmatched, ambiguous,
    committed: commit,
    written,
  });
}
