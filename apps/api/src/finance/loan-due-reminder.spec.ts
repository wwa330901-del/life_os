import { loanReminderText, shouldRemindLoan } from './loan-due-reminder.service';
import { FinanceLoanDirection } from '../../generated/prisma/client.js';

describe('loan due reminders', () => {
  it('reminds 3 days before, on the day, and every 7 days overdue', () => {
    const days = [5, 4, 3, 2, 1, 0, -1, -6, -7, -8, -14, -21];
    expect(days.filter(shouldRemindLoan)).toEqual([3, 0, -7, -14, -21]);
  });

  it('words lending and borrowing differently', () => {
    const lend = loanReminderText({ direction: FinanceLoanDirection.LEND, counterpartyName: '小明', dueDate: '2026-10-31' }, 5000, 3);
    expect(lend).toContain('小明跟你借的 5,000 元，約好 10/31 還（3 天後）');
    const borrow = loanReminderText({ direction: FinanceLoanDirection.BORROW, counterpartyName: '媽媽', dueDate: '2026-10-31' }, 2000, -7);
    expect(borrow).toContain('你跟媽媽借的 2,000 元，約好 10/31 要還（已經過了 7 天）');
  });
});
