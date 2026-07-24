// Per-project working-day rules: a weekly recurring off-day set, Taiwan's
// official government holiday calendar (on by default), and one-off manual
// exceptions in both directions (extra holiday / forced workday) that
// always take precedence over both of those. Ported from reno_pm's
// holiday_calendar.dart (isWorkingDay logic) + json_converters.dart
// (normalizeDate).

import { isTaiwanHoliday, isTaiwanMakeupWorkday } from './taiwan-holiday-calendar';
import { HolidayCalendarInput } from './scheduling-types';

export function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Dart's `DateTime.weekday`: Monday=1 .. Sunday=7 (JS's Date.getDay() is Sunday=0..Saturday=6). */
function dartWeekday(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function containsDate(dates: Date[], target: Date): boolean {
  const t = normalizeDate(target).getTime();
  return dates.some((d) => normalizeDate(d).getTime() === t);
}

export function isWorkingDay(date: Date, calendar: HolidayCalendarInput): boolean {
  const day = normalizeDate(date);
  if (containsDate(calendar.adHocWorkdays, day)) return true;
  if (containsDate(calendar.adHocHolidays, day)) return false;
  if (calendar.useTaiwanGovernmentCalendar) {
    if (isTaiwanMakeupWorkday(day)) return true;
    if (isTaiwanHoliday(day)) return false;
  }
  return !calendar.weeklyOffDays.includes(dartWeekday(day));
}
