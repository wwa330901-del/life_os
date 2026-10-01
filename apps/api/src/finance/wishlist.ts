/** 購物車排程（2026-10-02）：每月撥固定的錢買想要的東西，照優先順序排出
 * 每樣大概哪個月買得起。純函式。月份一律 'YYYY-MM'。 */

export interface WishInput {
  id: string;
  name: string;
  price: number;
  priority: number; // 1 高、2 中、3 低
  createdAt: Date;
  targetMonth: string | null;
}

export interface WishPlan {
  id: string;
  /** 存夠的月份；每月可撥的錢 ≤ 0 時排不出來＝null。 */
  month: string | null;
  /** 有目標日期時：趕不趕得上。 */
  onTime: boolean | null;
  /** 要趕上目標日，每月至少要撥多少（只在趕不上時給）。 */
  neededMonthly: number | null;
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function sortWishes<T extends WishInput>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.targetMonth ?? '9999-99').localeCompare(b.targetMonth ?? '9999-99') ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function planPurchases(items: WishInput[], monthlyBudget: number, currentMonth: string): WishPlan[] {
  let cumulative = 0;
  return sortWishes(items).map((item) => {
    cumulative += item.price;
    const month = monthlyBudget > 0 ? shiftMonth(currentMonth, Math.max(1, Math.ceil(cumulative / monthlyBudget)) - 1) : null;
    if (!item.targetMonth) return { id: item.id, month, onTime: null, neededMonthly: null };
    const onTime = month != null && month <= item.targetMonth;
    const monthsAvailable = Math.max(1, monthsBetween(currentMonth, item.targetMonth) + 1);
    return { id: item.id, month, onTime, neededMonthly: onTime ? null : Math.ceil(cumulative / monthsAvailable) };
  });
}

/** 沒設每月撥多少時的預設：近 3 個月平均結餘的 30%（結餘 ≤ 0 就是 0）。 */
export function defaultWishlistBudget(avgIncome: number, avgExpense: number): number {
  return Math.max(0, Math.round(((avgIncome - avgExpense) * 0.3) / 100) * 100);
}
