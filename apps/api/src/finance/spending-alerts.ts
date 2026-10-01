/** 花費異常判斷（2026-10-02）——純函式，方便測試。 */

/** 本月已經比過去 3 個月平均多這麼多倍。 */
export const SPIKE_RATIO = 1.5;
/** 而且至少多這麼多錢（避免小額分類一直叫）。 */
export const SPIKE_MIN_EXTRA = 1000;
/** 單筆大額：至少這麼多錢… */
export const LARGE_MIN = 3000;
/** …而且是平常單筆（90 天中位數）的這麼多倍。 */
export const LARGE_RATIO = 3;
/** 歷史筆數太少時，中位數不準，用這個門檻。 */
export const LARGE_FALLBACK = 5000;
const MIN_HISTORY = 10;

export interface CategorySpend {
  categoryId: string;
  name: string;
  /** 本月到今天為止。 */
  monthToDate: number;
  /** 前 3 個完整月份各花多少（沒花就是 0）。 */
  previousMonths: number[];
}

export interface CategorySpike {
  categoryId: string;
  name: string;
  monthToDate: number;
  average: number;
}

export function categorySpikes(rows: CategorySpend[]): CategorySpike[] {
  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      monthToDate: r.monthToDate,
      average: r.previousMonths.reduce((s, v) => s + v, 0) / Math.max(1, r.previousMonths.length),
    }))
    .filter((r) => r.average > 0 && r.monthToDate >= r.average * SPIKE_RATIO && r.monthToDate - r.average >= SPIKE_MIN_EXTRA)
    .sort((a, b) => b.monthToDate - b.average - (a.monthToDate - a.average));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 單筆支出要多大才算「特別大」。 */
export function largeExpenseThreshold(historyAmounts: number[]): number {
  if (historyAmounts.length < MIN_HISTORY) return LARGE_FALLBACK;
  return Math.max(LARGE_MIN, median(historyAmounts) * LARGE_RATIO);
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function spendingAlertText(
  spikes: CategorySpike[],
  large: { amount: number; category: string | null; note: string | null; date: string }[],
  usualExpense: number,
): string | null {
  if (spikes.length === 0 && large.length === 0) return null;
  const lines = ['💸 花費提醒'];
  for (const s of spikes.slice(0, 3)) {
    const pct = Math.round((s.monthToDate / s.average - 1) * 100);
    lines.push(`「${s.name}」這個月已經花 ${fmt(s.monthToDate)} 元，比過去 3 個月平均（${fmt(s.average)}）多 ${pct}%`);
  }
  for (const t of large.slice(0, 3)) {
    const what = [t.category, t.note].filter(Boolean).join('・') || '支出';
    lines.push(`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))} 有一筆 ${fmt(t.amount)} 元（${what}），比你平常單筆（約 ${fmt(usualExpense)}）大很多`);
  }
  lines.push('', large.length ? '是記錯的話跟我說「改成 X 元」或「刪掉那筆」。' : '想看細節可以問我「這個月哪裡花最多？」');
  lines.push('（不想收到傳「關閉花費提醒」）');
  return lines.join('\n');
}
