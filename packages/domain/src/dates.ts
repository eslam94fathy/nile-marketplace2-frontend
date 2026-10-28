// API timestamps are ISO UTC; the UI shows them in Cairo time (CLAUDE.md §8, conventions §8).
export const DISPLAY_TIME_ZONE = 'Africa/Cairo';
const DISPLAY_LOCALE = 'en-EG';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DATE_FORMAT = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;

function parseTimestamp(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError('Not a valid timestamp');
  return ms;
}

/**
 * `14 Oct 2026, 10:30` in Cairo time. Built from Intl parts because `en-EG` orders them
 * `Oct 14, 2026`, while conventions §8 fixes day-month-year.
 */
export function formatDateTime(iso: string): string {
  const parts = Object.fromEntries(
    DATE_TIME_FORMAT.formatToParts(parseTimestamp(iso)).map((part) => [part.type, part.value]),
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, string>>;
  const { day = '', month = '', year = '', hour = '', minute = '' } = parts;
  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

/** `14 Oct 2026` in Cairo time (conventions §8 order). A date-only value (`2026-10-14`) is that day. */
export function formatDate(iso: string): string {
  const parts = Object.fromEntries(
    DATE_FORMAT.formatToParts(parseTimestamp(iso)).map((part) => [part.type, part.value]),
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, string>>;
  const { day = '', month = '', year = '' } = parts;
  return `${day} ${month} ${year}`;
}

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat(DISPLAY_LOCALE, { numeric: 'auto' });
const DAY_S = 24 * HOUR_S;
/** From a week on, a date reads better than "12 days ago". */
const RELATIVE_MAX_DAYS = 7;

/**
 * `now`, `5 minutes ago`, `yesterday`, … for notification times (spec 00 §12.4); a week or older shows the
 * date (`14 Oct 2026`). A timestamp ahead of the client clock reads `now`.
 */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - parseTimestamp(iso)) / SECOND_MS));
  if (seconds < MINUTE_S) return RELATIVE_FORMAT.format(0, 'second');
  if (seconds < HOUR_S) return RELATIVE_FORMAT.format(-Math.floor(seconds / MINUTE_S), 'minute');
  if (seconds < DAY_S) return RELATIVE_FORMAT.format(-Math.floor(seconds / HOUR_S), 'hour');
  const days = Math.floor(seconds / DAY_S);
  if (days < RELATIVE_MAX_DAYS) return RELATIVE_FORMAT.format(-days, 'day');
  return formatDate(iso);
}

export interface Countdown {
  /** Whole seconds left, rounded up, so `00:00` is shown only once the deadline has passed. */
  readonly secondsLeft: number;
  readonly expired: boolean;
  /** `mm:ss` under one hour, otherwise `{h} h {mm} min` (conventions §8). */
  readonly label: string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * Time left until a server deadline (e.g. `paymentExpiresAt`). The deadline always comes from the API;
 * `nowMs` is the client clock, passed in so callers tick and tests stay deterministic.
 */
export function countdown(deadlineIso: string, nowMs: number): Countdown {
  const secondsLeft = Math.max(0, Math.ceil((parseTimestamp(deadlineIso) - nowMs) / SECOND_MS));
  const hours = Math.floor(secondsLeft / HOUR_S);
  const minutes = Math.floor((secondsLeft % HOUR_S) / MINUTE_S);
  const seconds = secondsLeft % MINUTE_S;
  const label = hours > 0 ? `${hours} h ${pad2(minutes)} min` : `${pad2(minutes)}:${pad2(seconds)}`;
  return { secondsLeft, expired: secondsLeft === 0, label };
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Cairo's UTC offset at an instant (Egypt observes summer time, so it isn't constant). */
function cairoOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(
    OFFSET_FORMAT.formatToParts(utcMs).map((part) => [part.type, Number(part.value)]),
  ) as Partial<Record<Intl.DateTimeFormatPartTypes, number>>;
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return wallAsUtc - Math.floor(utcMs / SECOND_MS) * SECOND_MS;
}

/** The UTC instant of a Cairo wall-clock time (the offset re-checked once around a summer-time change). */
function cairoWallToUtc(wallAsUtcMs: number): number {
  const first = wallAsUtcMs - cairoOffsetMs(wallAsUtcMs);
  return wallAsUtcMs - cairoOffsetMs(first);
}

/**
 * A Cairo calendar day (`2026-10-14`, as from `<input type="date">`) as the UTC instants of its first and last
 * millisecond, for `createdAt[gte]` / `createdAt[lte]` filters (CLAUDE.md §8: days are Cairo days).
 */
export function cairoDayBounds(day: string): { readonly start: string; readonly end: string } {
  const match = DAY_PATTERN.exec(day);
  if (match === null) throw new RangeError('Not a calendar day');
  const [, year = '', month = '', date = ''] = match;
  const midnight = Date.UTC(Number(year), Number(month) - 1, Number(date));
  const nextMidnight = Date.UTC(Number(year), Number(month) - 1, Number(date) + 1);
  return {
    start: new Date(cairoWallToUtc(midnight)).toISOString(),
    end: new Date(cairoWallToUtc(nextMidnight) - 1).toISOString(),
  };
}

/** Whether a string is a calendar day `YYYY-MM-DD` that exists. */
export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (match === null) return false;
  const [, year = '', month = '', date = ''] = match;
  const at = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  return at.toISOString().slice(0, 10) === value;
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * A Cairo wall-clock time as `<input type="datetime-local">` gives it (`2026-10-14T10:30`) → the UTC instant
 * as ISO (`…Z`, an offset the backend accepts), or null when it isn't a real date and time (AD-Q-7).
 */
export function cairoLocalToIso(local: string): string | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(local);
  if (match === null) return null;
  const [, year = '', month = '', day = '', hour = '', minute = ''] = match;
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const check = new Date(wall).toISOString().slice(0, 16);
  if (check !== local) return null;
  return new Date(cairoWallToUtc(wall)).toISOString();
}

/** An instant as Cairo wall-clock time for `<input type="datetime-local">` (`2026-10-14T10:30`). */
export function cairoLocalFromMs(utcMs: number): string {
  return new Date(utcMs + cairoOffsetMs(utcMs)).toISOString().slice(0, 16);
}
