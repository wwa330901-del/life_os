// Ported 1:1 from reno_pm's working_day_calculator_test.dart.

import {
  addWorkingDays,
  rollForwardToWorkingDay,
  nextWorkingDay,
  countWorkingDaysInclusive,
} from './working-day-calculator';
import { HolidayCalendarInput } from './scheduling-types';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// 2024-01-01 is a Monday.
const cal: HolidayCalendarInput = {
  weeklyOffDays: [7], // Sunday
  useTaiwanGovernmentCalendar: false,
  adHocHolidays: [],
  adHocWorkdays: [],
};

describe('WorkingDayCalculator', () => {
  it('skips weekly off-day (Sunday) when adding working days', () => {
    const from = d(2024, 1, 4); // Thursday
    const end = addWorkingDays(from, 3, cal);
    // Thu(0) Fri(1) Sat(2) Sun-skip Mon(3) -> 2024-01-08
    expect(end).toEqual(d(2024, 1, 8));
  });

  it('no weekend crossed stays a simple offset', () => {
    const from = d(2024, 1, 1); // Monday
    const end = addWorkingDays(from, 4, cal);
    expect(end).toEqual(d(2024, 1, 5)); // Friday
  });

  it('ad-hoc holiday is skipped in addition to weekly off-days', () => {
    const calWithHoliday: HolidayCalendarInput = {
      ...cal,
      adHocHolidays: [d(2024, 1, 3)], // Wed
    };
    const from = d(2024, 1, 1); // Monday
    const end = addWorkingDays(from, 3, calWithHoliday);
    // Mon(0) Tue(1) Wed-holiday-skip Thu(2) Fri(3) -> 2024-01-05
    expect(end).toEqual(d(2024, 1, 5));
  });

  it('ad-hoc workday reinstates a normally-off Sunday', () => {
    const calWithWorkday: HolidayCalendarInput = {
      ...cal,
      adHocWorkdays: [d(2024, 1, 7)], // Sunday
    };
    const from = d(2024, 1, 4); // Thursday
    const end = addWorkingDays(from, 3, calWithWorkday);
    // Thu(0) Fri(1) Sat(2) Sun-forced-workday(3) -> 2024-01-07
    expect(end).toEqual(d(2024, 1, 7));
  });

  it('duration of a single day (n=0) returns the start date itself', () => {
    const from = d(2024, 1, 1);
    const end = addWorkingDays(from, 0, cal);
    expect(end).toEqual(from);
  });

  it('crosses a year boundary correctly', () => {
    const from = d(2023, 12, 29); // Friday
    const end = addWorkingDays(from, 3, cal);
    // Fri(0) Sat(1) Sun-skip Mon(2) Tue(3) -> 2024-01-02
    expect(end).toEqual(d(2024, 1, 2));
  });

  it('rollForwardToWorkingDay moves off a Sunday to Monday', () => {
    const sunday = d(2024, 1, 7);
    expect(rollForwardToWorkingDay(sunday, cal)).toEqual(d(2024, 1, 8));
  });

  it('rollForwardToWorkingDay is a no-op on an already-working day', () => {
    const monday = d(2024, 1, 1);
    expect(rollForwardToWorkingDay(monday, cal)).toEqual(monday);
  });

  it('nextWorkingDay skips past a Sunday', () => {
    const saturday = d(2024, 1, 6);
    expect(nextWorkingDay(saturday, cal)).toEqual(d(2024, 1, 8));
  });

  describe('countWorkingDaysInclusive (inverse of addWorkingDays)', () => {
    it('same start and end on a working day counts as 1', () => {
      const monday = d(2024, 1, 1);
      expect(countWorkingDaysInclusive(monday, monday, cal)).toBe(1);
    });

    it('is the exact inverse of addWorkingDays across a weekend', () => {
      const from = d(2024, 1, 4); // Thursday
      const end = addWorkingDays(from, 3, cal); // 2024-01-08
      expect(countWorkingDaysInclusive(from, end, cal)).toBe(4);
    });

    it('skips the off-day itself when counting', () => {
      // Sat 1/6, Sun 1/7 (off), Mon 1/8 -> 2 working days (Sat, Mon).
      const count = countWorkingDaysInclusive(d(2024, 1, 6), d(2024, 1, 8), cal);
      expect(count).toBe(2);
    });

    it('returns 0 when end is before start', () => {
      const count = countWorkingDaysInclusive(d(2024, 1, 5), d(2024, 1, 1), cal);
      expect(count).toBe(0);
    });
  });
});
