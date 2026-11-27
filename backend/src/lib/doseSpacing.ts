// How long since the last dose, and whether another one is allowed yet.
//
// "Two tablets every 4 to 6 hours, maximum 8 in 24 hours" is how a great many
// as-required medicines are prescribed, and until now Caremid could not record
// the spacing at all: a medication had fixed clock times or it had none, and
// none meant as-required with no guard whatsoever. A carer could give
// paracetamol at 09:00 and again at 10:00, and nothing in the software would
// mention it. On a double-up, two carers each giving a dose they each thought
// was the first is the same error with nobody at fault.
//
// So the prescription's own limits become fields, and this works out what they
// mean right now. It does NOT decide what happens next: see tooSoon/capReached
// in the callers. A GP can legitimately say give it early, and a carer who
// cannot record what they actually did will either give it and not record it,
// or not give it. A recorded override is better than either.

/** Statuses that mean a dose actually went into the person. */
const COUNTS_AS_GIVEN = new Set(['GIVEN', 'SELF_ADMIN', 'FAMILY']);

export interface SpacingRule {
  /** Minimum hours between doses, from the prescription. */
  minGapHours?: number | null;
  /** Most doses allowed in any rolling 24 hours. */
  maxPer24h?: number | null;
}

export interface GivenDose {
  status: string;
  /** When it was actually given. */
  recordedAt: Date;
  carerName?: string | null;
}

export interface Spacing {
  /** The most recent dose that actually went in, if any. */
  lastGivenAt: Date | null;
  lastGivenBy: string | null;
  /** Earliest the next dose is allowed, from minGapHours. Null if no rule. */
  nextAllowedAt: Date | null;
  /** True when `at` is before nextAllowedAt. */
  tooSoon: boolean;
  /** Doses given in the 24 hours before `at`. */
  givenInLast24h: number;
  /** True when that count already meets or exceeds maxPer24h. */
  capReached: boolean;
}

const HOUR = 3_600_000;

/**
 * Work out the spacing position for one medication at a moment in time.
 *
 * `doses` is that medication's administrations — order does not matter, and
 * anything that is not a dose actually taken (refused, missed, not required)
 * is ignored, because none of those put a drug into anybody.
 */
export function doseSpacing(rule: SpacingRule, doses: GivenDose[], at: Date = new Date()): Spacing {
  const given = doses
    .filter((d) => COUNTS_AS_GIVEN.has(d.status) && d.recordedAt <= at)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

  const last = given[0] ?? null;
  const minGap = rule.minGapHours && rule.minGapHours > 0 ? rule.minGapHours : null;
  const nextAllowedAt = last && minGap ? new Date(last.recordedAt.getTime() + minGap * HOUR) : null;

  const since = new Date(at.getTime() - 24 * HOUR);
  const givenInLast24h = given.filter((d) => d.recordedAt > since).length;
  const cap = rule.maxPer24h && rule.maxPer24h > 0 ? rule.maxPer24h : null;

  return {
    lastGivenAt: last?.recordedAt ?? null,
    lastGivenBy: last?.carerName ?? null,
    nextAllowedAt,
    tooSoon: !!nextAllowedAt && at < nextAllowedAt,
    givenInLast24h,
    capReached: !!cap && givenInLast24h >= cap,
  };
}

/** A sentence a carer can act on, or null when there is nothing to say. */
export function spacingNote(s: Spacing, rule: SpacingRule): string | null {
  if (!s.lastGivenAt) return null;
  const t = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const who = s.lastGivenBy ? ` by ${s.lastGivenBy}` : '';
  const parts = [`Last given ${t(s.lastGivenAt)}${who}`];
  if (s.nextAllowedAt) parts.push(s.tooSoon ? `next from ${t(s.nextAllowedAt)}` : 'due now');
  if (rule.maxPer24h) parts.push(`${s.givenInLast24h} of ${rule.maxPer24h} in 24h`);
  return parts.join(' · ');
}
