// Ported 1:1 from reno_pm's holiday_calendar_test.dart.

import { isWorkingDay } from './holiday-calendar';
import { HolidayCalendarInput } from './scheduling-types';

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function cal(overrides: Partial<HolidayCalendarInput> = {}): HolidayCalendarInput {
  return {
    weeklyOffDays: [7], // Sunday
    useTaiwanGovernmentCalendar: true,
    adHocHolidays: [],
    adHocWorkdays: [],
    ...overrides,
  };
}

describe('isWorkingDay with Taiwan government calendar (default on)', () => {
  it('a named national holiday is off even on an ordinary weekday', () => {
    // 2026-01-01 開國紀念日 falls on a Thursday.
    expect(isWorkingDay(d(2026, 1, 1), cal())).toBe(false);
  });

  it('an ordinary Saturday with no holiday is still a working day', () => {
    // 2026-01-03 is a plain Saturday, not a named holiday.
    expect(isWorkingDay(d(2026, 1, 3), cal())).toBe(true);
  });

  it('a plain Sunday is still off via the weekly pattern, not the calendar', () => {
    expect(isWorkingDay(d(2026, 1, 4), cal())).toBe(false); // Sunday
  });

  it('turning the flag off restores an ordinary weekday as a working day', () => {
    expect(isWorkingDay(d(2026, 1, 1), cal({ useTaiwanGovernmentCalendar: false }))).toBe(true);
  });

  it('an explicit adHocWorkday overrides a Taiwan holiday', () => {
    expect(isWorkingDay(d(2026, 1, 1), cal({ adHocWorkdays: [d(2026, 1, 1)] }))).toBe(true);
  });

  it('an explicit adHocHoliday still works independent of the Taiwan calendar', () => {
    expect(isWorkingDay(d(2026, 3, 3), cal({ adHocHolidays: [d(2026, 3, 3)] }))).toBe(false);
  });

  it('a date outside the covered years just falls back to the weekly pattern', () => {
    // Far future date with no Taiwan calendar data available for that year —
    // behavior should be exactly the plain Sunday-off pattern, whichever
    // weekday this particular date happens to land on.
    const farFuture = d(2099, 6, 15);
    const dartWeekday = farFuture.getDay() === 0 ? 7 : farFuture.getDay();
    const expectedWorkingDay = dartWeekday !== 7;
    expect(isWorkingDay(farFuture, cal())).toBe(expectedWorkingDay);
  });
});
