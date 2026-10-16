import { useEffect, useState } from 'react';
import { pendingItems, subscribeOutbox } from './outbox';
import type { ClockRecord } from '../types';

export interface ClockStatus {
  clockedIn: boolean;
  record: ClockRecord | null;
}

// Clock actions taken offline haven't reached the server, so /clock/status still
// reports the old state. Lay the queued actions on top so the app shows what the
// carer actually did — otherwise they'd see "not clocked in" and tap it again.
export interface PendingClock {
  status: ClockStatus | undefined;
  // Visits finished offline (queued clock-out) — treated as complete in the UI.
  doneShiftIds: string[];
}

export function applyPendingClock(base: ClockStatus | undefined, userId?: string): PendingClock {
  const items = pendingItems();
  if (!items.length) return { status: base, doneShiftIds: [] };

  let status: ClockStatus | undefined = base;
  // The visit currently open per the queue (or per the server, before the queue).
  let openShiftId: string | null = base?.clockedIn ? base.record?.shiftId ?? null : null;
  const doneShiftIds: string[] = [];

  for (const it of items) {
    if (it.kind === 'clock.in') {
      openShiftId = (it.payload.shiftId as string | undefined) ?? null;
      status = {
        clockedIn: true,
        record: {
          id: `pending-${it.id}`,
          userId: userId || '',
          shiftId: openShiftId,
          clockIn: it.capturedAt,
          clockOut: null,
        } as ClockRecord,
      };
    } else if (it.kind === 'clock.out') {
      if (openShiftId) doneShiftIds.push(openShiftId);
      openShiftId = null;
      status = { clockedIn: false, record: null };
    }
  }
  return { status, doneShiftIds };
}

// Re-renders whenever the queue changes, so the overlay stays current.
export function usePendingClock(base: ClockStatus | undefined, userId?: string): PendingClock {
  const [, bump] = useState(0);
  useEffect(() => subscribeOutbox(() => bump((n) => n + 1)), []);
  return applyPendingClock(base, userId);
}

// Work queued offline for a given visit, so the UI reflects it before it syncs.
// Without this a carer who wrote a log offline would still be blocked from
// clocking out (that button waits for the log to exist on the server).
export interface PendingVisitWork {
  hasLog: boolean;
  supportEntries: { id: string; body: string; at: string }[];
  // `${medicationId}|${scheduledFor}` for doses already recorded offline.
  medKeys: Set<string>;
}

export function usePendingVisitWork(shiftId?: string): PendingVisitWork {
  const [, bump] = useState(0);
  useEffect(() => subscribeOutbox(() => bump((n) => n + 1)), []);
  const items = pendingItems();
  const forShift = items.filter((i) => (i.payload as { shiftId?: string }).shiftId === shiftId);
  return {
    hasLog: forShift.some((i) => i.kind === 'callLog.create' || i.kind === 'supportLog.create'),
    supportEntries: forShift
      .filter((i) => i.kind === 'supportLog.create')
      .map((i) => ({
        id: i.id,
        body: String((i.payload as { body?: string }).body || ''),
        at: i.capturedAt,
      })),
    medKeys: new Set(
      items
        .filter((i) => i.kind === 'med.record')
        .map((i) => {
          const p = i.payload as { medicationId?: string; scheduledFor?: string };
          return `${p.medicationId}|${p.scheduledFor}`;
        }),
    ),
  };
}
