/** 借貸本金：一般借貸是 initialTransaction 的金額；期初借貸（學貸這種之前就欠的）
 * 沒有交易，用 openingAmount。所有算「還欠多少」的地方都要用這個。 */
export function loanPrincipal(loan: { initialTransaction?: { amount: number } | null; openingAmount?: number | null }): number {
  return loan.initialTransaction?.amount ?? loan.openingAmount ?? 0;
}

/** 這個月的扣款日（YYYY-MM-DD）；day 超過當月天數就用月底。 */
export function installmentDateOf(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 設定每月還款時，這個月的扣款日已經過了就當這個月已經扣過（不補記），
 * 從下個月開始自動記；還沒到就這個月開始。 */
export function initialInstallmentLastMonth(today: string, day: number): string | null {
  const month = today.slice(0, 7);
  return installmentDateOf(month, day) < today ? month : null;
}

/** 今天要不要自動記這個月的還款：到了（或過了）扣款日、這個月還沒記過。 */
export function installmentDue(today: string, day: number, lastMonth: string | null): boolean {
  const month = today.slice(0, 7);
  if (lastMonth != null && lastMonth >= month) return false;
  return today >= installmentDateOf(month, day);
}

/** 下一次扣款日（提醒用）。 */
export function nextInstallmentDate(today: string, day: number, lastMonth: string | null): string {
  const month = today.slice(0, 7);
  const thisMonth = installmentDateOf(month, day);
  if ((lastMonth == null || lastMonth < month) && thisMonth >= today) return thisMonth;
  return installmentDateOf(nextMonth(month), day);
}
