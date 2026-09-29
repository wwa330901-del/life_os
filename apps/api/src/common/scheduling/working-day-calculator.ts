// Date-only working-day arithmetic that skips a project's off-days. Ported
// from reno_pm's working_day_calculator.dart.

import { normalizeDate, isWorkingDay } from './holiday-calendar';
import { HolidayCalendarInput } from './scheduling-types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

/** If `date` itself isn't a working day, rolls forward to the next one. */
export function rollForwardToWorkingDay(date: Date, calendar: HolidayCalendarInput): Date {
  let d = normalizeDate(date);
  while (!isWorkingDay(d, calendar)) {
    d = addDays(d, 1);
  }
  return d;
}

/** The next working day strictly after `date`. */
export function nextWorkingDay(date: Date, calendar: HolidayCalendarInput): Date {
  let d = addDays(normalizeDate(date), 1);
  while (!isWorkingDay(d, calendar)) {
    d = addDays(d, 1);
  }
  return d;
}

/**
 * Adds `n` working days to `from`, where `from` is assumed to already be a
 * working day and counts as day 0 (so `addWorkingDays(from, 0, cal)` returns
 * `from` itself — used for a single-day-duration task's end date).
 */
export function addWorkingDays(from: Date, n: number, calendar: HolidayCalendarInput): Date {
  let d = normalizeDate(from);
  let remaining = n;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, calendar)) remaining--;
  }
  return d;
}

/**
 * Inverse of addWorkingDays: the number of working days from `start` to
 * `end` inclusive of both ends (so `start === end` on a working day returns
 * 1, matching how WorkItem.durationDays is defined). Returns 0 if `end` is
 * before `start`.
 */
export function countWorkingDaysInclusive(
  start: Date,
  end: Date,
  calendar: HolidayCalendarInput,
): number {
  const endNormalized = normalizeDate(end);
  let d = normalizeDate(start);
  let count = 0;
  while (d.getTime() <= endNormalized.getTime()) {
    if (isWorkingDay(d, calendar)) count++;
    d = addDays(d, 1);
  }
  return count;
}
