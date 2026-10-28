import { describe, expect, it } from 'vitest';
import {
  cairoDayBounds,
  cairoLocalFromMs,
  cairoLocalToIso,
  countdown,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isCalendarDay,
} from './dates';

describe('formatDateTime', () => {
  it('shows Cairo time as "14 Oct 2026, 10:30"', () => {
    // Cairo is UTC+3 in October 2026 (summer time).
    expect(formatDateTime('2026-10-14T07:30:00.000Z')).toBe('14 Oct 2026, 10:30');
  });

  it('uses the winter offset (UTC+2) in January', () => {
    expect(formatDateTime('2026-01-05T22:15:00Z')).toBe('6 Jan 2026, 00:15');
  });

  it('respects an explicit offset in the input', () => {
    expect(formatDateTime('2026-10-14T10:30:00+03:00')).toBe('14 Oct 2026, 10:30');
  });

  it('rejects an invalid timestamp', () => {
    expect(() => formatDateTime('not a date')).toThrow(RangeError);
  });
});

describe('formatDate', () => {
  it('shows the Cairo day as "14 Oct 2026"', () => {
    expect(formatDate('2026-10-14T07:30:00.000Z')).toBe('14 Oct 2026');
  });

  it('late UTC evening is already the next day in Cairo', () => {
    expect(formatDate('2026-01-05T22:15:00Z')).toBe('6 Jan 2026');
  });

  it('a date-only value stays that day', () => {
    expect(formatDate('2026-10-01')).toBe('1 Oct 2026');
  });

  it('rejects an invalid value', () => {
    expect(() => formatDate('nope')).toThrow(RangeError);
  });
});

describe('countdown', () => {
  const deadline = '2026-10-14T12:00:00.000Z';
  const at = (iso: string): number => Date.parse(iso);

  it('shows mm:ss under one hour', () => {
    expect(countdown(deadline, at('2026-10-14T11:45:30.000Z'))).toEqual({
      secondsLeft: 870,
      expired: false,
      label: '14:30',
    });
  });

  it('shows "{h} h {mm} min" from one hour', () => {
    expect(countdown(deadline, at('2026-10-14T10:55:00.000Z')).label).toBe('1 h 05 min');
    expect(countdown(deadline, at('2026-10-14T11:00:00.000Z')).label).toBe('1 h 00 min');
  });

  it('shows 59:59 just under one hour', () => {
    expect(countdown(deadline, at('2026-10-14T11:00:01.000Z')).label).toBe('59:59');
  });

  it('rounds partial seconds up, so 00:00 means expired', () => {
    const almost = countdown(deadline, at('2026-10-14T11:59:59.900Z'));
    expect(almost).toEqual({ secondsLeft: 1, expired: false, label: '00:01' });
    expect(countdown(deadline, at(deadline))).toEqual({ secondsLeft: 0, expired: true, label: '00:00' });
  });

  it('stays at zero after the deadline', () => {
    expect(countdown(deadline, at('2026-10-14T13:00:00.000Z'))).toEqual({
      secondsLeft: 0,
      expired: true,
      label: '00:00',
    });
  });

  it('rejects an invalid deadline', () => {
    expect(() => countdown('', 0)).toThrow(RangeError);
  });
});

describe('cairoDayBounds (Cairo calendar days for createdAt filters)', () => {
  it('winter time (UTC+2): 22:00 UTC the evening before to 21:59:59.999 UTC', () => {
    expect(cairoDayBounds('2026-01-15')).toEqual({
      start: '2026-01-14T22:00:00.000Z',
      end: '2026-01-15T21:59:59.999Z',
    });
  });

  it('summer time (UTC+3): 21:00 UTC the evening before', () => {
    expect(cairoDayBounds('2026-07-15')).toEqual({
      start: '2026-07-14T21:00:00.000Z',
      end: '2026-07-15T20:59:59.999Z',
    });
  });

  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(() => cairoDayBounds('15/07/2026')).toThrow(RangeError);
  });

  it('isCalendarDay: real days only', () => {
    expect(isCalendarDay('2026-02-28')).toBe(true);
    expect(isCalendarDay('2026-02-30')).toBe(false);
    expect(isCalendarDay('2026-2-3')).toBe(false);
  });
});

describe('Cairo local date-time (AD-Q-7)', () => {
  it('winter (UTC+2) and summer (UTC+3) wall times → UTC instants', () => {
    expect(cairoLocalToIso('2026-01-15T10:30')).toBe('2026-01-15T08:30:00.000Z');
    expect(cairoLocalToIso('2026-07-15T10:30')).toBe('2026-07-15T07:30:00.000Z');
  });

  it('refuses malformed or impossible values', () => {
    expect(cairoLocalToIso('2026-02-30T10:00')).toBeNull();
    expect(cairoLocalToIso('2026-01-15 10:30')).toBeNull();
    expect(cairoLocalToIso('')).toBeNull();
  });

  it('an instant as Cairo wall time, round-tripping', () => {
    const now = Date.parse('2026-10-16T09:05:42.000Z');
    expect(cairoLocalFromMs(now)).toMatch(/^2026-10-16T1[12]:05$/);
    expect(cairoLocalToIso(cairoLocalFromMs(now))).toBe('2026-10-16T09:05:00.000Z');
  });
});

describe('formatRelativeTime (spec 00 §12.4)', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [0, 'now'],
    [59, 'now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [2 * 3600, '2 hours ago'],
    [26 * 3600, 'yesterday'],
    [3 * 86_400, '3 days ago'],
  ])('%i seconds ago reads %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });

  it('a week or older shows the date', () => {
    expect(formatRelativeTime('2026-10-14T10:00:00.000Z', now)).toBe('14 Oct 2026');
  });

  it('a time ahead of the client clock reads now', () => {
    expect(formatRelativeTime(ago(-120), now)).toBe('now');
  });
});
