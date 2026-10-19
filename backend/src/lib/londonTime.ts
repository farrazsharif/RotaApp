// UK day boundaries.
//
// The servers run in UTC but the business runs in the UK, so "Monday" is
// Monday in London, not Monday in UTC. For eight months of the year those are
// an hour apart, which matters wherever a report buckets real timestamps by
// day: a carer clocking in at 00:55 BST on Monday for a 01:00 visit is
// recorded at 23:55 UTC on Sunday, and a UTC-bounded week counted those hours
// in the previous pay week.
//
// Uses the Intl time zone database rather than a hardcoded +1/+0 so the DST
// switch dates stay right without anyone maintaining them.

const LONDON = 'Europe/London';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// How far ahead of UTC London is at a given instant, in ms (+1h during BST).
function londonOffset(at: Date): number {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  // Compare against the instant truncated to the second, since the formatted
  // wall clock has no milliseconds.
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// The UTC instant at which a given wall-clock time occurs on a London date.
function londonInstant(ymd: string, h: number, mi: number, s: number, ms: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const wallMs = Date.UTC(y, m - 1, d, h, mi, s, ms);
  // The offset depends on the instant being solved for, so guess using the
  // naive one and correct once. The offset only ever moves by an hour, so a
  // single correction settles it either side of a DST switch.
  const first = londonOffset(new Date(wallMs));
  const out = new Date(wallMs - first);
  const second = londonOffset(out);
  return second === first ? out : new Date(wallMs - second);
}

// Start of a London day (00:00:00.000 local), as a UTC instant.
export function londonDayStart(date: unknown): Date {
  return londonInstant(String(date).slice(0, 10), 0, 0, 0, 0);
}

// End of a London day (23:59:59.999 local), as a UTC instant. Spans the WHOLE
// final day, so a range ending "today" still includes today's records.
export function londonDayEnd(date: unknown): Date {
  return londonInstant(String(date).slice(0, 10), 23, 59, 59, 999);
}
