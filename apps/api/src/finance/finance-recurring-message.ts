// 定期交易自動記帳後傳 LINE 的文字——純函式，方便測試（不 import Prisma）。

export interface RecurringRecordedInfo {
  label: string;
  // 定期交易只會是收入、支出、轉帳；其他種類當成沒有正負號。
  type: string;
  amount: number;
  accountName: string;
  toAccountName?: string | null;
  /** 記帳的日期（台北時間的那一天）。 */
  date: Date;
  /** 記完之後帳戶的餘額；查不到就不顯示那行。 */
  balance?: number | null;
}

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function recurringRecordedMessage(info: RecurringRecordedInfo): string {
  const day = `${info.date.getMonth() + 1}/${info.date.getDate()}`;
  const sign = info.type === 'INCOME' ? '+' : info.type === 'EXPENSE' ? '−' : '';
  const where =
    info.type === 'TRANSFER' ? `${info.accountName} → ${info.toAccountName ?? ''}` : info.accountName;
  const lines = ['🔁 定期交易已自動記帳', `${info.label} ${sign}${money(info.amount)}（${where}，${day}）`];
  if (info.balance != null) lines.push(`${info.accountName}現在：${money(info.balance)}`);
  return lines.join('\n');
}
