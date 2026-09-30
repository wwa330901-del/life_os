const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type ReviewKind = 'week' | 'month';

/** All bounds are date-only keys (UTC midnight of a Taipei calendar day),
 * `end` exclusive — the same convention as `FinanceTransaction.date`. */
export interface ReviewPeriod {
  kind: ReviewKind;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** 顯示用，例如「9/28–10/4」「9 月」 */
  label: string;
  /** 本期是不是還沒過完（臨時查詢「這週/這個月到目前為止」）。 */
  partial: boolean;
}

function taipeiToday(now: Date): Date {
  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

const md = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

/**
 * 週回顧：這週一到今天（週日晚上排程送出時＝完整一週），上期＝上週一到週日。
 * 月回顧：
 *  - `completedMonth`（每月 1 號排程）＝上個月整月，上期＝再上個月；
 *  - 否則（臨時查詢）＝這個月 1 號到今天，上期＝上個月同樣天數。
 */
export function reviewPeriod(kind: ReviewKind, now: Date, completedMonth = false): ReviewPeriod {
  const today = taipeiToday(now);
  const tomorrow = new Date(today.getTime() + MS_PER_DAY);

  if (kind === 'week') {
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const start = new Date(today.getTime() - daysSinceMonday * MS_PER_DAY);
    const sunday = new Date(start.getTime() + 6 * MS_PER_DAY);
    return {
      kind,
      start,
      end: tomorrow,
      prevStart: new Date(start.getTime() - 7 * MS_PER_DAY),
      prevEnd: new Date(tomorrow.getTime() - 7 * MS_PER_DAY),
      label: `${md(start)}–${md(sunday)}`,
      partial: daysSinceMonday < 6,
    };
  }

  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (completedMonth) {
    const start = new Date(Date.UTC(y, m - 1, 1));
    return {
      kind,
      start,
      end: new Date(Date.UTC(y, m, 1)),
      prevStart: new Date(Date.UTC(y, m - 2, 1)),
      prevEnd: start,
      label: `${start.getUTCMonth() + 1} 月`,
      partial: false,
    };
  }
  const start = new Date(Date.UTC(y, m, 1));
  const prevStart = new Date(Date.UTC(y, m - 1, 1));
  const days = Math.round((tomorrow.getTime() - start.getTime()) / MS_PER_DAY);
  const prevEnd = new Date(Math.min(prevStart.getTime() + days * MS_PER_DAY, start.getTime()));
  return {
    kind,
    start,
    end: tomorrow,
    prevStart,
    prevEnd,
    label: `${m + 1} 月`,
    partial: true,
  };
}

/** Date-only key → the real UTC instant Taipei's day starts at. */
export function keyToInstant(key: Date): Date {
  return new Date(key.getTime() - TAIPEI_OFFSET_MS);
}

export function dateKeyString(key: Date): string {
  return key.toISOString().slice(0, 10);
}
