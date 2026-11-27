// Pure date math for 定期交易's holiday adjustment — kept dependency-free
// (no Nest/Prisma imports, since the generated Prisma client currently isn't
// resolvable from ts-jest) so it can be unit-tested directly, same reasoning
// as ../projects/scheduling/holiday-calendar.ts. `Adjustment` mirrors the
// generated FinanceRecurringHolidayAdjustment type (itself just a
// string-literal union, not a nominal enum), so callers can pass that
// Prisma type straight through without a cast.

import { isTaiwanHoliday } from '../common/scheduling/taiwan-holiday-calendar';

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

/** 定期交易這個月的狀態（App、首頁顯示「✓ 11/5 已自動記帳・下次 12/5」用）。
 * today 是台北的年(year)、月(month, 0-based)、日(day)；回傳的日期都是 "YYYY-MM-DD"。 */
export function recurringMonthStatus(
  today: { year: number; month: number; day: number },
  dayOfMonth: number,
  adjustment: Adjustment,
  lastTriggeredMonth: string | null,
): { firedThisMonth: boolean; thisMonthDate: string; nextDate: string } {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthKey = `${today.year}-${String(today.month + 1).padStart(2, '0')}`;
  const thisMonth = effectiveTriggerDate(today.year, today.month, dayOfMonth, lastDay(today.year, today.month), adjustment);
  const nextYear = today.month === 11 ? today.year + 1 : today.year;
  const nextMonth = (today.month + 1) % 12;
  const following = effectiveTriggerDate(nextYear, nextMonth, dayOfMonth, lastDay(nextYear, nextMonth), adjustment);
  const firedThisMonth = lastTriggeredMonth === monthKey;
  const stillAhead = !firedThisMonth && thisMonth.getUTCDate() >= today.day;
  return { firedThisMonth, thisMonthDate: key(thisMonth), nextDate: key(stillAhead ? thisMonth : following) };
}

/** 這個月該不該補跑（定期交易、定期定額共用，2026-11-27）。
 * 伺服器是 Render 免費方案，沒人用會睡著，早上 9 點的排程常常沒跑到；
 * 所以改成「扣款日當天或之後、這個月還沒跑過」都算到期，醒來就補。
 * 但計畫是在這個月扣款日「之後」才建立的，這個月不算（不然 11/27 新增一筆
 * 每月 5 號的，會馬上補記 11/5）——從下個月開始。
 * todayKey / createdKey 都是台北日期 "YYYY-MM-DD"。回傳這個月的扣款日，或 null（不用跑）。 */
export function dueTriggerDate(
  todayKey: string,
  dayOfMonth: number,
  adjustment: Adjustment,
  lastTriggeredMonth: string | null,
  createdKey: string,
): Date | null {
  const [year, month, day] = todayKey.split('-').map(Number);
  const monthKey = todayKey.slice(0, 7);
  if (lastTriggeredMonth === monthKey) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const trigger = effectiveTriggerDate(year, month - 1, dayOfMonth, lastDay, adjustment);
  const triggerKey = trigger.toISOString().slice(0, 10);
  // 假日往前調可能跨到上個月，那就當作這個月 1 號已到。
  if (triggerKey.slice(0, 7) === monthKey && trigger.getUTCDate() > day) return null;
  if (createdKey > triggerKey) return null;
  return trigger;
}
