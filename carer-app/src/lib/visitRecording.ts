import type { Shift } from '../types';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// End timestamp of a visit, handling overnight visits that wrap past midnight
// (e.g. 19:00–07:00 ends the next morning).
export function visitEndMs(shift: Shift): number {
  const base = new Date(shift.date);
  base.setHours(0, 0, 0, 0);
  let endMin = toMin(shift.endTime);
  if (endMin < toMin(shift.startTime)) endMin += 24 * 60;
  return base.getTime() + endMin * 60_000;
}

// A visit is "recorded" once a call log exists for it (shared across co-carers).
export function isLogged(shift: Shift): boolean {
  return (shift._count?.callLogs ?? 0) > 0;
}

// Past = the visit has finished.
export function isVisitPast(shift: Shift, nowMs: number = Date.now()): boolean {
  return visitEndMs(shift) < nowMs;
}

// Needs recording = a finished visit with no call log yet (and not cancelled).
// These keep showing in the app until the carer records them.
export function needsRecording(shift: Shift, nowMs: number = Date.now()): boolean {
  return shift.status !== 'CANCELLED' && !isLogged(shift) && isVisitPast(shift, nowMs);
}

export type RecordState = 'recorded' | 'record' | 'upcoming';

// 'recorded' = has a log; 'record' = finished but no log yet (needs recording);
// 'upcoming' = not finished.
export function recordState(shift: Shift, nowMs: number = Date.now()): RecordState {
  if (isLogged(shift)) return 'recorded';
  if (isVisitPast(shift, nowMs)) return 'record';
  return 'upcoming';
}

// Every still-unrecorded past visit in a list, most recent first.
export function unrecordedVisits(shifts: Shift[], nowMs: number = Date.now()): Shift[] {
  return shifts
    .filter((s) => needsRecording(s, nowMs))
    .sort((a, b) => visitEndMs(b) - visitEndMs(a));
}
