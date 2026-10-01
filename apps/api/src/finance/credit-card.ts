/** 信用卡帳單週期（2026-10-01）——純日期計算，日期一律 'YYYY-MM-DD'（台北）。
 * 結帳日/繳款日是 1-31，當月沒有那天（例如 2 月 30 日）就用月底。 */

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The date in (year, month0) for a 1-31 setting, clamped to month end.
 * month0 may overflow either way (-1 = previous December, 12 = next January). */
function dayIn(year: number, month0: number, day: number): string {
  const d = new Date(Date.UTC(year, month0, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

function parts(key: string): [number, number] {
  const [y, m] = key.split('-').map(Number);
  return [y, m - 1];
}

/** 今天或之後最近的一個繳款日。 */
export function upcomingDueDate(today: string, dueDay: number): string {
  const [y, m0] = parts(today);
  const thisMonth = dayIn(y, m0, dueDay);
  return thisMonth >= today ? thisMonth : dayIn(y, m0 + 1, dueDay);
}

/** 這個繳款日對應的結帳日：繳款日之前最近的一個結帳日。 */
export function statementDateFor(dueDate: string, statementDay: number): string {
  const [y, m0] = parts(dueDate);
  const sameMonth = dayIn(y, m0, statementDay);
  return sameMonth < dueDate ? sameMonth : dayIn(y, m0 - 1, statementDay);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 應繳金額：結帳日當天的欠款（卡片餘額是負的）減掉結帳後已經繳的。 */
export function amountDue(balanceAtStatement: number, paidSinceStatement: number): number {
  return Math.max(0, Math.round(-balanceAtStatement - paidSinceStatement));
}

/** 提醒時機：繳款日前 3 天、當天。 */
export const REMIND_DAYS_BEFORE = [3, 0];
