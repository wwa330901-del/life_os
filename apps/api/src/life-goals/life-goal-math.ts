import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** First day (as a `@db.Date` key) of the check-in window a CHECK_IN goal
 * counts — Taipei calendar, weeks start Monday. Null for TOTAL. Takes the
 * `LifeGoalPeriod` values as plain strings so this stays free of the Prisma
 * client import (Jest can't load it). */
export function checkInPeriodStart(period: 'TOTAL' | 'WEEKLY' | 'MONTHLY', now = new Date()): Date | null {
  if (period === 'TOTAL') return null;
  const today = taipeiDateKeyToUtcMidnight(taipeiDateKey(now));
  if (period === 'MONTHLY') {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  }
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - daysSinceMonday * MS_PER_DAY);
}

/** 0..1 progress toward target, measured from `startValue` (null = 0) so a
 * goal that goes *down* (體重 75→70) works the same as one that goes up.
 * Null when there's no usable target or no current number. */
export function goalProgressFraction(goal: {
  targetValue: number | null;
  currentValue: number | null;
  startValue: number | null;
}): number | null {
  const { targetValue, currentValue } = goal;
  if (targetValue == null || currentValue == null) return null;
  const start = goal.startValue ?? 0;
  if (targetValue === start) return currentValue === targetValue ? 1 : 0;
  return Math.min(1, Math.max(0, (currentValue - start) / (targetValue - start)));
}
