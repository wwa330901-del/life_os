import { occurrenceDateKeysInRange, occurrenceStartEnd, dateKeyBefore } from './calendar-recurrence';
import { taipeiWallClockToUtc } from '../common/taipei-date';

describe('occurrenceDateKeysInRange', () => {
  it('DAILY: one key per Taipei calendar day in the half-open range', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 1, 9, 0),
      endAt: null,
      recurrenceFrequency: 'DAILY' as const,
      recurrenceUntil: null,
    };
    expect(occurrenceDateKeysInRange(series, '2026-01-05', '2026-01-08')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
  });

  it('WEEKLY: lands every 7 days from the anchor date', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 1, 9, 0), // Thursday
      endAt: null,
      recurrenceFrequency: 'WEEKLY' as const,
      recurrenceUntil: null,
    };
    expect(occurrenceDateKeysInRange(series, '2026-01-01', '2026-02-01')).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
  });

  it('MONTHLY: clamps day 31 to each month\'s actual last day, then recovers in a 31-day month', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 31, 9, 0), // Jan 31
      endAt: null,
      recurrenceFrequency: 'MONTHLY' as const,
      recurrenceUntil: null,
    };
    // Feb 2026 has 28 days, Mar has 31.
    expect(occurrenceDateKeysInRange(series, '2026-01-01', '2026-04-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('stops at recurrenceUntil (inclusive)', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 1, 9, 0),
      endAt: null,
      recurrenceFrequency: 'DAILY' as const,
      recurrenceUntil: taipeiWallClockToUtc(2026, 0, 3, 0, 0),
    };
    expect(occurrenceDateKeysInRange(series, '2026-01-01', '2026-01-10')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('fast-forwards correctly for an anchor years before the queried range', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2018, 0, 1, 9, 0),
      endAt: null,
      recurrenceFrequency: 'DAILY' as const,
      recurrenceUntil: null,
    };
    expect(occurrenceDateKeysInRange(series, '2026-06-10', '2026-06-12')).toEqual([
      '2026-06-10',
      '2026-06-11',
    ]);
  });

  it('NONE frequency never generates occurrences', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 1, 9, 0),
      endAt: null,
      recurrenceFrequency: 'NONE' as const,
      recurrenceUntil: null,
    };
    expect(occurrenceDateKeysInRange(series, '2026-01-01', '2026-02-01')).toEqual([]);
  });
});

describe('occurrenceStartEnd', () => {
  it('preserves Taipei time-of-day and duration on the new date', () => {
    const series = {
      startAt: taipeiWallClockToUtc(2026, 0, 1, 9, 30),
      endAt: taipeiWallClockToUtc(2026, 0, 1, 10, 15),
    };
    const { startAt, endAt } = occurrenceStartEnd(series, '2026-03-15');
    expect(startAt.getTime()).toBe(taipeiWallClockToUtc(2026, 2, 15, 9, 30).getTime());
    expect(endAt!.getTime()).toBe(taipeiWallClockToUtc(2026, 2, 15, 10, 15).getTime());
  });

  it('endAt stays null when the series has none', () => {
    const series = { startAt: taipeiWallClockToUtc(2026, 0, 1, 0, 0), endAt: null };
    expect(occurrenceStartEnd(series, '2026-03-15').endAt).toBeNull();
  });
});

describe('dateKeyBefore', () => {
  it('crosses month and year boundaries', () => {
    expect(dateKeyBefore('2026-03-01')).toBe('2026-02-28');
    expect(dateKeyBefore('2026-01-01')).toBe('2025-12-31');
  });
});
