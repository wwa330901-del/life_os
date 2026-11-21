import { recurringRecordedMessage } from './finance-recurring-message';

describe('recurringRecordedMessage', () => {
  const date = new Date(2026, 10, 5);

  it('收入：寫出金額、帳戶、日期和記完後的餘額', () => {
    expect(
      recurringRecordedMessage({ label: '薪水', type: 'INCOME', amount: 52000, accountName: '郵局', date, balance: 127000 }),
    ).toBe('🔁 定期交易已自動記帳\n薪水 +52,000（郵局，11/5）\n郵局現在：127,000');
  });

  it('支出用減號', () => {
    expect(recurringRecordedMessage({ label: '房租', type: 'EXPENSE', amount: 12000, accountName: '郵局', date, balance: 115000 })).toContain(
      '房租 −12,000（郵局，11/5）',
    );
  });

  it('轉帳寫兩邊帳戶', () => {
    expect(
      recurringRecordedMessage({ label: '存錢', type: 'TRANSFER', amount: 5000, accountName: '郵局', toAccountName: '台新', date, balance: 1 }),
    ).toContain('存錢 5,000（郵局 → 台新，11/5）');
  });

  it('查不到餘額就不寫那行', () => {
    expect(recurringRecordedMessage({ label: '薪水', type: 'INCOME', amount: 1, accountName: '郵局', date })).not.toContain('現在');
  });
});
