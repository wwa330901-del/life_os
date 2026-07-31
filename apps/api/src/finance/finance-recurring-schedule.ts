// Pure date math for 定期交易's holiday adjustment — kept dependency-free
// (no Nest/Prisma imports, since the generated Prisma client currently isn't
// resolvable from ts-jest) so it can be unit-tested directly, same reasoning
// as ../projects/scheduling/holiday-calendar.ts. `Adjustment` mirrors the
// generated FinanceRecurringHolidayAdjustment type (itself just a
// string-literal union, not a nominal enum), so callers can pass that
// Prisma type straight through without a cast.

import { isTaiwanHoliday } from '../projects/scheduling/taiwan-holiday-calendar';

export type Adjustment = 'NONE' | 'EARLIER' | 'LATER';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Weekend or Taiwan government holiday — same definition 工期表 scheduling uses.
 * Dates here are always UTC-midnight-normalized (see effectiveTriggerDate), so
 * getUTCDay matches isTaiwanHoliday's own UTC-based normalization regardless
 * of the server process's local timezone. */
function isHoliday(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6 || isTaiwanHoliday(date);
}

/** Rolls `date` a day at a time in `direction` (-1 earlier, +1 later) until it lands on a non-holiday. */
function rollToWorkingDay(date: Date, direction: -1 | 1): Date {
  let d = date;
  while (isHoliday(d)) {
    d = new Date(d.getTime() + direction * ONE_DAY_MS);
  }
  return d;
}

/** The date a recurring entry actually fires on this month, after applying its holiday adjustment.
 * Note: if the adjustment rolls the date across a month boundary (e.g. day 1
 * with EARLIER during a New Year holiday run), the shifted date won't match
 * `today` in the month it rolled into either, since each month's cron pass
 * only computes this against its own year/month — a known gap rather than
 * something worth extra machinery for, same tradeoff the Taiwan holiday
 * table itself takes with its limited year coverage. */
export function effectiveTriggerDate(
  year: number,
  month: number,
  dayOfMonth: number,
  lastDayOfMonth: number,
  adjustment: Adjustment,
): Date {
  const nominal = new Date(Date.UTC(year, month, Math.min(dayOfMonth, lastDayOfMonth)));
  if (adjustment === 'EARLIER') return rollToWorkingDay(nominal, -1);
  if (adjustment === 'LATER') return rollToWorkingDay(nominal, 1);
  return nominal;
}
