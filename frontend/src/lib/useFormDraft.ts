import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps an unsaved form in this browser so leaving the page does not throw it
 * away.
 *
 * Why here and not on the server, as the incident investigation does: a
 * supervision or a spot check is CREATED by its form. Writing a half-typed one
 * would put a supervision in the register with a date on it, and the CQC check
 * reads that as the carer having been supervised. A draft nobody finished
 * would quietly mark a job done. So the draft stays in the browser and the
 * record is still only written when somebody presses Save.
 *
 * The cost of that choice is that a draft belongs to one browser on one
 * machine, which is the right trade for a form somebody is filling in now and
 * came back to five minutes later.
 */

const PREFIX = 'caremid:draft:';
const DEBOUNCE_MS = 500;

// Older than this and it is not the form somebody stepped away from, it is
// abandoned work from another week that would be startling to see again.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  at: number;
  value: T;
}

function readDraft<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    // A private window, storage switched off, or a half-written entry. None of
    // them should stop the form working.
    return null;
  }
}

export interface FormDraft<T> {
  /** What was left behind last time, read once when the form opened. */
  restored: T | null;
  /** When that draft was written. */
  restoredAt: Date | null;
  /** Hold the current values. Debounced, and flushed if the form goes away. */
  keep: (value: T) => void;
  /** Throw the draft away: on a successful save, or when asked to discard. */
  clear: () => void;
  /** When the draft was last written, for telling somebody it is safe. */
  savedAt: Date | null;
}

/**
 * `recordSavedAt` is when the SERVER record this form edits was last written.
 *
 * Without it a draft always won, on the assumption that a draft must be newer
 * than the saved record. It need not be. Somebody opens a blank form, types a
 * character, wanders off; a colleague then fills the record in properly and
 * saves it. The first person's stale draft — possibly empty — then masks the
 * colleague's work every time they open the form, and nothing on screen says
 * the record underneath is fine. That is how an administrator came to see a
 * blank employment history that a manager had already completed.
 *
 * So a draft older than the last save is discarded, not shown. Leave it out
 * only for a form with no saved record behind it yet.
 */
export function useFormDraft<T>(key: string | null, enabled = true, recordSavedAt?: string | Date | null): FormDraft<T> {
  // Read once. Re-reading later would fight whatever is being typed.
  const [initial] = useState(() => {
    if (!key || !enabled) return null;
    const found = readDraft<T>(key);
    if (!found) return null;
    const saved = recordSavedAt ? new Date(recordSavedAt).getTime() : 0;
    if (saved && Number.isFinite(saved) && found.at <= saved) {
      // Superseded by a real save. Drop it so it cannot come back.
      try { localStorage.removeItem(PREFIX + key); } catch { /* nothing to clear */ }
      return null;
    }
    return found;
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const latest = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so the unmount flush writes with the current key rather than the one
  // the effect closed over when it was created.
  const target = useRef({ key, enabled });
  target.current = { key, enabled };

  const write = useCallback(() => {
    const { key: k, enabled: on } = target.current;
    if (!k || !on || latest.current === null) return;
    const at = Date.now();
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify({ at, value: latest.current }));
      return at;
    } catch {
      // Out of quota, or storage blocked. The form still works; it just will
      // not survive being left.
      return undefined;
    }
  }, []);

  const keep = useCallback(
    (value: T) => {
      latest.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const at = write();
        if (at) setSavedAt(new Date(at));
      }, DEBOUNCE_MS);
    },
    [write],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    latest.current = null;
    setSavedAt(null);
    const { key: k } = target.current;
    if (!k) return;
    try {
      localStorage.removeItem(PREFIX + k);
    } catch {
      /* nothing to clear */
    }
  }, []);

  // The case the debounce cannot cover: the form going away inside the pause,
  // by closing the modal or by navigating off. localStorage is synchronous,
  // so unlike a network save this one always lands.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      write();
    },
    [write],
  );

  return {
    restored: initial?.value ?? null,
    restoredAt: initial ? new Date(initial.at) : null,
    keep,
    clear,
    savedAt,
  };
}
