// Who is working a visit.
//
// There are two shapes. A 1:1 visit carries its carers in `userId` (primary)
// and `coverCarers` (second/third on a double-up). A Supported Living HOUSE
// visit carries them in its resident slots instead — one slot per required
// carer per resident — and leaves those two fields empty.
//
// Every check of "is this carer on this visit" therefore has to look in both
// places. Written as `shift.userId === me || shift.coverCarers.some(...)` it
// quietly refuses every carer on a house visit: they would be told they are not
// assigned to a shift they are standing in.

export interface AssignmentShape {
  userId?: string | null;
  siteId?: string | null;
  coverCarers?: { id: string }[];
  residentSlots?: { userId: string | null }[];
}

export function carerIsOnShift(shift: AssignmentShape, userId: string): boolean {
  if (shift.siteId) return (shift.residentSlots ?? []).some((sl) => sl.userId === userId);
  return shift.userId === userId || (shift.coverCarers ?? []).some((c) => c.id === userId);
}

// The Prisma `OR` that matches the visits one carer is working, for use in a
// where clause. Same rule as carerIsOnShift, expressed as a query.
export function carerShiftsOr(userId: string) {
  return [
    { userId },
    { coverCarers: { some: { id: userId } } },
    { residentSlots: { some: { userId } } },
  ];
}

// What to select so the two helpers above have what they need.
export const assignmentSelect = {
  userId: true,
  siteId: true,
  coverCarers: { select: { id: true } },
  residentSlots: { select: { userId: true } },
} as const;
