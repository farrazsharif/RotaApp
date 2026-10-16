import { idbAll, idbAdd, idbDelete, idbAvailable } from './idb';
import api from './axios';

// Offline outbox. When the phone has no signal, a carer's actions are stored on
// the device with the EXACT moment they happened and replayed, in order, as soon
// as the network is back. The server honours the captured time (see
// backend/src/lib/clientTime.ts), so a 7am visit synced at 2pm is still recorded
// as 7am — right hours on the timesheet, right time on the MAR.
export type OutboxKind =
  | 'clock.in'
  | 'clock.out'
  | 'callLog.create'
  | 'supportLog.create'
  | 'med.record'
  | 'finance.create';

export interface OutboxItem {
  seq?: number; // IndexedDB key — also the FIFO order
  id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  receipt?: Blob; // finance only: the photo, uploaded after the txn is created
  receiptName?: string;
  capturedAt: string; // ISO — when the carer actually did it
}

export interface OutboxFailure {
  id: string;
  kind: OutboxKind;
  capturedAt: string;
  error: string;
}

const FAILURES_KEY = 'caremid.outboxFailures';

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

/* ---------------- subscribers (pending count / badges) ---------------- */
type Listener = () => void;
const listeners = new Set<Listener>();
let cache: OutboxItem[] = [];

export function subscribeOutbox(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function pendingItems(): OutboxItem[] { return cache; }
export function pendingCount(): number { return cache.length; }

async function refresh(): Promise<void> {
  if (!idbAvailable()) { cache = []; return; }
  try {
    cache = (await idbAll<OutboxItem>()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } catch { cache = []; }
  listeners.forEach((l) => l());
}

/* ---------------- failures the carer should be told about ---------------- */
export function outboxFailures(): OutboxFailure[] {
  try { return JSON.parse(localStorage.getItem(FAILURES_KEY) || '[]'); } catch { return []; }
}
export function clearOutboxFailures(): void {
  localStorage.removeItem(FAILURES_KEY);
  listeners.forEach((l) => l());
}
function recordFailure(item: OutboxItem, error: string): void {
  const list = outboxFailures();
  list.push({ id: item.id, kind: item.kind, capturedAt: item.capturedAt, error });
  try { localStorage.setItem(FAILURES_KEY, JSON.stringify(list.slice(-50))); } catch { /* ignore */ }
}

/* ---------------- queueing ---------------- */
export async function enqueue(
  kind: OutboxKind,
  payload: Record<string, unknown>,
  opts?: { receipt?: Blob; receiptName?: string; capturedAt?: string },
): Promise<void> {
  await idbAdd<OutboxItem>({
    id: newId(),
    kind,
    payload,
    capturedAt: opts?.capturedAt || new Date().toISOString(),
    ...(opts?.receipt ? { receipt: opts.receipt, receiptName: opts.receiptName } : {}),
  });
  await refresh();
}

// An axios failure with no response is a network/offline problem — queue it.
// Anything with a response is the server actually answering (e.g. a validation
// error), which must surface to the carer rather than being silently queued.
function isNetworkError(e: unknown): boolean {
  const err = e as { response?: unknown; code?: string };
  return !err?.response;
}

// Send now if we can, otherwise queue. Returns null when it was queued.
export async function sendOrQueue<T>(
  kind: OutboxKind,
  payload: Record<string, unknown>,
  online: () => Promise<T>,
  opts?: { receipt?: Blob; receiptName?: string },
): Promise<T | null> {
  const capturedAt = new Date().toISOString();
  if (idbAvailable() && typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue(kind, payload, { ...opts, capturedAt });
    return null;
  }
  try {
    return await online();
  } catch (e) {
    if (idbAvailable() && isNetworkError(e)) {
      await enqueue(kind, payload, { ...opts, capturedAt });
      return null;
    }
    throw e;
  }
}

/* ---------------- replay ---------------- */
async function send(item: OutboxItem): Promise<void> {
  const at = item.capturedAt;
  const p = item.payload;
  switch (item.kind) {
    case 'clock.in':
      await api.post('/clock/in', { ...p, at });
      return;
    case 'clock.out':
      await api.post('/clock/out', { ...p, at });
      return;
    case 'callLog.create':
      await api.post('/call-logs', { ...p, createdAt: at });
      return;
    case 'supportLog.create':
      await api.post('/support-log', { ...p, createdAt: at });
      return;
    case 'med.record':
      await api.post('/medications/administrations', { ...p, recordedAt: at });
      return;
    case 'finance.create': {
      // The receipt upload needs the id the create returns, so the pair is
      // replayed together rather than queued as two independent actions.
      const r = await api.post<{ id: string }>('/financial-transactions', { ...p, date: p.date || at });
      if (item.receipt && r.data?.id) {
        const form = new FormData();
        form.append('file', item.receipt, item.receiptName || 'receipt.jpg');
        await api.post(`/financial-transactions/${r.data.id}/receipt`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      return;
    }
  }
}

let flushing = false;

// Replay the queue in order. Stops at the first network/server problem so the
// order is preserved and nothing is lost; a permanently-rejected item is dropped
// (with a note for the carer) so it can't block everything behind it forever.
export async function flushOutbox(): Promise<void> {
  if (flushing || !idbAvailable()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!localStorage.getItem('carer_token')) return; // logged out — keep queued
  flushing = true;
  try {
    const items = (await idbAll<OutboxItem>()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    for (const item of items) {
      try {
        await send(item);
        if (item.seq !== undefined) await idbDelete(item.seq);
      } catch (e) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        const status = err.response?.status;
        // 401 = the session expired, not bad data: keep the item and retry
        // after the carer signs in again. Losing a care record here would be
        // silent data loss, so only a genuine refusal is dropped.
        const permanent =
          !!status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
        if (permanent) {
          recordFailure(item, err.response?.data?.error || `Rejected (${status})`);
          if (item.seq !== undefined) await idbDelete(item.seq);
          continue;
        }
        break; // offline again / server down — retry the rest later
      }
    }
  } finally {
    flushing = false;
    await refresh();
  }
}

let started = false;

// Wire up replay: on startup, whenever the device comes back online, and on a
// slow timer as a backstop (the 'online' event can be unreliable on mobile).
export function startOutbox(): void {
  if (started || !idbAvailable()) return;
  started = true;
  void refresh().then(() => flushOutbox());
  window.addEventListener('online', () => { void flushOutbox(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox();
  });
  setInterval(() => { void flushOutbox(); }, 30_000);
}
