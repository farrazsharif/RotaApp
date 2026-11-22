import { prisma } from './prisma';
import { ukWallClockToUtc } from './awayPeriods';

/**
 * Doses that fell due while the client was in hospital, or away on respite.
 *
 * A missed dose is a medicines failure: somebody should have given it and did
 * not. A dose that fell due while the person was on a hospital ward is not
 * that. The ward gave it, or decided not to; either way it was not the
 * service's to give, and counting it as missed states something untrue about
 * the care - on the dashboard, in the CQC evidence, and to an inspector
 * reading the MAR chart.
 *
 * So the away periods the office already records (RespitePeriod, type HOSPITAL
 * or RESPITE) decide it. Nothing is rewritten: whatever the carer recorded at
 * the time stays exactly as recorded, and this only changes how it is counted
 * and labelled. That matters because the office can move an admission or a
 * return date afterwards - "Update return date" on the client page does
 * exactly that - and when they do, every dose re-answers the question itself
 * rather than being stuck with an answer stamped on it in a one-off job.
 */

export interface AwayWindow {
  serviceUserId: string;
  startAt: Date;
  endAt: Date;
  type: string; // HOSPITAL | RESPITE
}

/** Away periods overlapping a range, for a set of clients. */
export async function awayWindows(
  serviceUserIds: string[],
  from: Date,
  to: Date,
): Promise<AwayWindow[]> {
  if (!serviceUserIds.length) return [];
  return prisma.respitePeriod.findMany({
    where: { serviceUserId: { in: serviceUserIds }, startAt: { lt: to }, endAt: { gt: from } },
    select: { serviceUserId: true, startAt: true, endAt: true, type: true },
  });
}

/**
 * A dose's scheduledFor is a UK wall-clock time encoded as if it were UTC
 * (the dose is due at 08:00 on the client's clock, whatever the season).
 * Away-period boundaries are real instants. Comparing the two directly is
 * right for seven months of the year and an hour out for the other five, so
 * convert the dose to the instant it actually falls on first.
 */
export function doseInstant(scheduledFor: Date): Date {
  return ukWallClockToUtc(
    scheduledFor.getUTCFullYear(),
    scheduledFor.getUTCMonth(),
    scheduledFor.getUTCDate(),
    scheduledFor.getUTCHours(),
    scheduledFor.getUTCMinutes(),
  );
}

/** HOSPITAL, RESPITE, or null where the client was at home. */
export function awayTypeAt(
  windows: AwayWindow[],
  serviceUserId: string,
  scheduledFor: Date,
): string | null {
  const at = doseInstant(scheduledFor).getTime();
  const hit = windows.find(
    (w) => w.serviceUserId === serviceUserId && at >= w.startAt.getTime() && at < w.endAt.getTime(),
  );
  return hit ? hit.type : null;
}

const DAY = 24 * 60 * 60 * 1000;

/** Drop the doses that fell due while the client was away. */
export async function dropAwayDoses<T extends { serviceUserId: string; scheduledFor: Date }>(
  rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows;
  const times = rows.map((r) => r.scheduledFor.getTime());
  const windows = await awayWindows(
    [...new Set(rows.map((r) => r.serviceUserId))],
    new Date(Math.min(...times) - DAY),
    new Date(Math.max(...times) + DAY),
  );
  if (!windows.length) return rows;
  return rows.filter((r) => !awayTypeAt(windows, r.serviceUserId, r.scheduledFor));
}
