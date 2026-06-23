import type { Shift } from '../types';

// A call is "done" for this carer once they've clocked in and back out of it —
// shift.status itself is never flipped to COMPLETED by the backend.
export function isCallDone(shift: Shift, userId: string | undefined): boolean {
  if (!userId) return false;
  return !!shift.clockRecords?.some((r) => r.userId === userId && r.clockOut);
}
