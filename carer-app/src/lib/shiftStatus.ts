import type { Shift } from '../types';

// A call is "done" for this carer once they've clocked in and back out of it —
// shift.status itself is never flipped to COMPLETED by the backend.
export function isCallDone(shift: Shift, userId: string | undefined): boolean {
  if (!userId) return false;
  return !!shift.clockRecords?.some((r) => r.userId === userId && r.clockOut);
}

// The hours THIS carer works on a visit.
//
// A house is covered across the day by carers on staggered shifts - one 7am to
// 3pm, another 2pm to 10pm - so the visit's own times describe the house, not
// anybody's shift. Showing a carer the house's span would tell them to be
// there for fifteen hours.
//
// A carer can fill more than one slot on the same house (covering two
// residents), so take the earliest start and the latest end across their own
// slots. Falls back to the visit's times, which is what every 1:1 visit and
// every house slot without its own times uses.
export function myTimes(shift: Shift, userId?: string): { startTime: string; endTime: string } {
  const fallback = { startTime: shift.startTime, endTime: shift.endTime };
  if (!shift.siteId || !userId) return fallback;
  const mine = (shift.residentSlots ?? []).filter((sl) => sl.userId === userId && sl.startTime && sl.endTime);
  if (mine.length === 0) return fallback;
  return {
    startTime: mine.reduce((a, b) => (b.startTime! < a ? b.startTime! : a), mine[0].startTime!),
    endTime: mine.reduce((a, b) => (b.endTime! > a ? b.endTime! : a), mine[0].endTime!),
  };
}

// What to call a visit. A Supported Living house visit has no client of its
// own — it covers several residents — so it is named after the house. Reading
// shift.serviceUser directly leaves those showing as "Service user", which
// tells a carer nothing about where they are going.
export function shiftTitle(shift: Shift): string {
  if (shift.siteId) return shift.site?.name || 'House visit';
  const su = shift.serviceUser;
  return su ? `${su.firstName} ${su.lastName}` : 'Service user';
}

// How many carers are actually named on this visit, against how many it needs.
//
// A visit can now reach a carer's rota before every slot is filled, so that
// someone already assigned can plan their week while the office is still
// filling the rest. The cost of that is a double-up can look staffed when it
// isn't, and a carer who assumes the second person is coming might attempt a
// two-person task alone — so anywhere a visit is shown, short staffing is
// called out rather than left to be inferred from a head-count badge.
export function staffing(shift: Shift): { assigned: number; needed: number; short: boolean } {
  const assigned = (shift.userId ? 1 : 0) + (shift.coverCarers?.length ?? 0);
  const needed = shift.cover || 1;
  return { assigned, needed, short: assigned < needed };
}
