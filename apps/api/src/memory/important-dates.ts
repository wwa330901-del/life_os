import { Lunar, Solar } from 'lunar-typescript';

/** 重要日子下一次是哪天（2026-10-01）。日期一律 'YYYY-MM-DD'（台北）。 */

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function solarFor(year: number, month: number, day: number): string {
  // 2/29 生日在平年用 2/28。
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return key(year, month, Math.min(day, last));
}

/** 農曆 year 年 month 月 day 日的國曆；小月沒有 30 號就用 29 號。 */
function lunarToSolar(year: number, month: number, day: number): string {
  for (let d = day; d >= Math.min(day, 29); d--) {
    try {
      const s = Lunar.fromYmd(year, month, d).getSolar();
      // lunar-typescript 對不存在的日子不一定丟錯，會順延到下個月——檢查回轉。
      const back = s.getLunar();
      if (back.getMonth() === month && back.getDay() === d) return key(s.getYear(), s.getMonth(), s.getDay());
    } catch {
      // 這個月沒有這天，試前一天
    }
  }
  const s = Lunar.fromYmd(year, month, 29).getSolar();
  return key(s.getYear(), s.getMonth(), s.getDay());
}

export interface Occurrence {
  date: string;
  daysLeft: number;
  /** 有出生／開始年份時：滿幾歲或第幾週年。 */
  years: number | null;
}

export function nextOccurrence(
  today: string,
  d: { month: number; day: number; year?: number | null; isLunar: boolean },
): Occurrence {
  const [ty] = today.split('-').map(Number);
  let best: { date: string; baseYear: number } | null = null;
  // 農曆年和國曆年跨年不一致，前後一年都試，取今天以後最早的。
  for (const y of [ty - 1, ty, ty + 1]) {
    const date = d.isLunar ? lunarToSolar(y, d.month, d.day) : solarFor(y, d.month, d.day);
    if (date >= today && (!best || date < best.date)) best = { date, baseYear: y };
  }
  const { date, baseYear } = best!;
  const daysLeft = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { date, daysLeft, years: d.year ? baseYear - d.year : null };
}

export function describeDate(d: { month: number; day: number; isLunar: boolean }): string {
  return `${d.isLunar ? '農曆' : ''}${d.month}/${d.day}`;
}

/** 提醒時機：前 7 天、前 1 天、當天。 */
export const DATE_REMIND_DAYS = [7, 1, 0];

/** Exposed for tests. */
export function solarToLunarKey(date: string): string {
  const [y, m, dd] = date.split('-').map(Number);
  const l = Solar.fromYmd(y, m, dd).getLunar();
  return `${l.getMonth()}/${l.getDay()}`;
}
