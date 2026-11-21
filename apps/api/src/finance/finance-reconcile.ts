// 平帳的計算——純函式（不 import Prisma），方便測試。

export const FORGOT_EXPENSE_CATEGORY = '忘記記帳';
export const EXTRA_INCOME_CATEGORY = '多出來的錢';

export interface ReconcilePlan {
  difference: number;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  categoryName: string;
}

/** 帳上 bookBalance、實際 actualBalance（信用卡欠錢是負數）。差不到 1 元回 null（不用平帳）。 */
export function planReconcile(bookBalance: number, actualBalance: number): ReconcilePlan | null {
  const difference = Math.round((actualBalance - bookBalance) * 100) / 100;
  if (Math.abs(difference) < 1) return null;
  return difference < 0
    ? { difference, type: 'EXPENSE', amount: -difference, categoryName: FORGOT_EXPENSE_CATEGORY }
    : { difference, type: 'INCOME', amount: difference, categoryName: EXTRA_INCOME_CATEGORY };
}

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function reconcileNote(bookBalance: number, actualBalance: number): string {
  return `平帳：帳上 ${money(bookBalance)} → 實際 ${money(actualBalance)}`;
}
