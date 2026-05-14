/**
 * Pure business-hours clamping for the email scheduler. No Convex imports —
 * unit-testable in isolation. All times are epoch-ms (UTC); the "business
 * hours" window is interpreted in Europe/London local time so BST/GMT are
 * handled correctly.
 */

export interface BusinessHoursConfig {
  businessHoursEnabled: boolean;
  /** Minutes past local midnight when the window opens, e.g. 540 = 09:00. */
  businessHoursStartUtcMinutes: number;
  /** Minutes past local midnight when the window closes (exclusive), e.g. 1080 = 18:00. */
  businessHoursEndUtcMinutes: number;
  /** Day-of-week numbers that count as business days: 0=Sun … 6=Sat. Seeded [1,2,3,4,5]. */
  businessDays: number[];
}

interface LondonParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0=Sun … 6=Sat. */
  weekday: number;
}

const LONDON_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Decompose a UTC epoch-ms into Europe/London wall-clock parts. */
function getLondonParts(ts: number): LondonParts {
  const parts = LONDON_FORMAT.formatToParts(ts);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  // Intl can emit "24" for midnight in some engines — normalise.
  if (hour === 24) hour = 0;
  const minute = get("minute");
  // Day-of-week of a calendar date is timezone-independent, so derive it from
  // the London calendar date treated as a UTC date.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/**
 * Given a London wall-clock date + time, return the matching UTC epoch-ms.
 * Works across DST because we measure the actual offset at the candidate
 * instant. Safe for 09:00 targets (never inside the 01:00–02:00 DST gap).
 */
function londonWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): number {
  // First guess: treat the wall clock as if it were UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Measure how far London is ahead of UTC at that instant.
  const guessParts = getLondonParts(guess);
  const guessAsUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
  );
  const offsetMs = guessAsUtc - guess; // +3600000 during BST, 0 during GMT
  return guess - offsetMs;
}

/** True when `ts` is on a business day and inside [start, end) London local. */
export function isWithinBusinessHours(
  ts: number,
  config: BusinessHoursConfig,
): boolean {
  const p = getLondonParts(ts);
  if (!config.businessDays.includes(p.weekday)) return false;
  const minutesIntoDay = p.hour * 60 + p.minute;
  return (
    minutesIntoDay >= config.businessHoursStartUtcMinutes &&
    minutesIntoDay < config.businessHoursEndUtcMinutes
  );
}

/**
 * Clamp `ts` into the next valid business-hours window.
 * - Disabled config → returned unchanged.
 * - Already in-window → returned unchanged.
 * - Before today's window on a business day → today at start.
 * - Otherwise → the next business day at start.
 */
export function clampToBusinessHours(
  ts: number,
  config: BusinessHoursConfig,
): number {
  if (!config.businessHoursEnabled) return ts;
  if (isWithinBusinessHours(ts, config)) return ts;

  const start = getLondonParts(ts);
  const minutesIntoDay = start.hour * 60 + start.minute;
  const isBusinessDay = config.businessDays.includes(start.weekday);

  // Case: business day, before the window opens → today at start.
  if (isBusinessDay && minutesIntoDay < config.businessHoursStartUtcMinutes) {
    return londonWallClockToUtc(
      start.year,
      start.month,
      start.day,
      Math.floor(config.businessHoursStartUtcMinutes / 60),
      config.businessHoursStartUtcMinutes % 60,
    );
  }

  // Otherwise advance day-by-day to the next business day, then return its
  // window start. Cap the loop defensively.
  for (let addDays = 1; addDays <= 14; addDays++) {
    const candidateUtcMidnight = Date.UTC(
      start.year,
      start.month - 1,
      start.day + addDays,
    );
    const candidate = getLondonParts(candidateUtcMidnight);
    if (config.businessDays.includes(candidate.weekday)) {
      return londonWallClockToUtc(
        candidate.year,
        candidate.month,
        candidate.day,
        Math.floor(config.businessHoursStartUtcMinutes / 60),
        config.businessHoursStartUtcMinutes % 60,
      );
    }
  }

  // Unreachable with any non-empty businessDays — fail loud rather than silent.
  throw new Error(
    `clampToBusinessHours: no business day found within 14 days (businessDays=${JSON.stringify(config.businessDays)})`,
  );
}
