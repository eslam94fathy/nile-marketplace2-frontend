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
