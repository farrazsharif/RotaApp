// Offline-capable clients (the carer app) record the moment an action actually
// happened on the device, then send it when they next reach the network. Use
// that time when it's present and sane, otherwise fall back to "now".
//
// Without this, anything queued offline would be stamped with the time it
// SYNCED, not the time the carer did it — wrong hours on a clock record and a
// false time on a MAR entry.
const MAX_FUTURE_MS = 2 * 60 * 1000; // allow a little device clock skew
const MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000; // ignore absurdly old values

export function clientTime(raw: unknown, now: Date = new Date()): Date {
  if (typeof raw !== 'string' || !raw) return now;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return now;
  if (d.getTime() > now.getTime() + MAX_FUTURE_MS) return now;
  if (d.getTime() < now.getTime() - MAX_PAST_MS) return now;
  return d;
}
