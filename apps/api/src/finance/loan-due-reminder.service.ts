import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey, utcDateKey } from '../common/taipei-date';
import { daysBetween } from './credit-card';
import { FinanceLoanDirection } from '../../generated/prisma/client.js';
import { loanPrincipal } from './loan-installment';

/** 前 3 天、當天、過期後每 7 天（7、14、21…天）提醒。 */
export function shouldRemindLoan(daysLeft: number): boolean {
  return daysLeft === 3 || daysLeft === 0 || (daysLeft < 0 && -daysLeft % 7 === 0);
}

export function loanReminderText(
  loan: { direction: FinanceLoanDirection; counterpartyName: string; dueDate: string },
  outstanding: number,
  daysLeft: number,
): string {
  const [, m, d] = loan.dueDate.split('-').map(Number);
  const amount = Math.round(outstanding).toLocaleString('en-US');
  const when = daysLeft > 0 ? `${daysLeft} 天後` : daysLeft === 0 ? '今天' : `已經過了 ${-daysLeft} 天`;
  const who = loan.counterpartyName;
  return loan.direction === FinanceLoanDirection.LEND
    ? `💰 ${who}跟你借的 ${amount} 元，約好 ${m}/${d} 還（${when}）\n收到了跟我說「${who}還我 ${amount}」我幫你記。`
    : `💰 你跟${who}借的 ${amount} 元，約好 ${m}/${d} 要還（${when}）\n還了跟我說「還${who} ${amount}」我幫你記。`;
}

/** 借貸約定還款日提醒（2026-10-01）。 */
@Injectable()
export class LoanDueReminderService {
  private readonly logger = new Logger(LoanDueReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async remind(): Promise<void> {
    const today = taipeiDateKey(new Date());
    const loans = await this.prisma.financeLoan.findMany({
      where: { settled: false, dueDate: { not: null } },
      include: {
        initialTransaction: { select: { amount: true } },
        repayments: { include: { transaction: { select: { amount: true } } } },
      },
    });
    for (const loan of loans) {
      try {
        const dueDate = utcDateKey(loan.dueDate!);
        const daysLeft = daysBetween(today, dueDate);
        if (!shouldRemindLoan(daysLeft)) continue;
        const key = `${dueDate}:${daysLeft}`;
        if (loan.dueReminderKey === key) continue;
        const repaid = loan.repayments.reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
        const outstanding = loanPrincipal(loan) - repaid;
        if (outstanding <= 0) continue;
        await this.prisma.financeLoan.update({ where: { id: loan.id }, data: { dueReminderKey: key } });
        await this.notifier.notifyBySpace(loan.spaceId, loanReminderText({ ...loan, dueDate }, outstanding, daysLeft));
      } catch (error) {
        this.logger.error(`借貸還款提醒失敗（${loan.counterpartyName}）`, error);
      }
    }
  }
}
