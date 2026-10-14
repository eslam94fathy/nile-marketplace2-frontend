import { describe, expect, it } from 'vitest';
import { countdown, formatDateTime } from './dates';

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
