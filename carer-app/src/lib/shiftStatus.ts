import type { Shift } from '../types';

// A call is "done" for this carer once they've clocked in and back out of it —
// shift.status itself is never flipped to COMPLETED by the backend.
export function isCallDone(shift: Shift, userId: string | undefined): boolean {
  if (!userId) return false;
  return !!shift.clockRecords?.some((r) => r.userId === userId && r.clockOut);
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
