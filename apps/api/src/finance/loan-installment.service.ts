import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey } from '../common/taipei-date';
import { daysBetween } from './credit-card';
import { FinanceLoansService } from './finance-loans.service';
import { installmentDue, nextInstallmentDate } from './loan-installment';
import { FinanceLoanDirection } from '../../generated/prisma/client.js';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** 借貸每月固定還款（2026-10-07，學貸、分期）：扣款日自動記一筆還款，前 3 天 LINE 提醒。
 * 伺服器哪天沒跑到，下一次跑會補記（installmentDue 是「到了或過了、這個月還沒記」）。 */
@Injectable()
export class LoanInstallmentService {
  private readonly logger = new Logger(LoanInstallmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: FinanceLoansService,
    private readonly notifier: LineNotifierService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async run(now = new Date()): Promise<void> {
    const today = taipeiDateKey(now);
    const month = today.slice(0, 7);
    const loans = await this.prisma.financeLoan.findMany({
      where: { settled: false, installmentAmount: { not: null }, installmentDay: { not: null } },
      include: { space: { select: { financeAccounts: { select: { id: true, name: true } } } } },
    });
    for (const loan of loans) {
      try {
        const day = loan.installmentDay!;
        const accountName = loan.space.financeAccounts.find((a) => a.id === loan.installmentAccountId)?.name ?? '';
        const label = loan.direction === FinanceLoanDirection.BORROW ? `還${loan.counterpartyName}` : `${loan.counterpartyName}還你`;
        if (installmentDue(today, day, loan.installmentLastMonth)) {
          const result = await this.loans.recordInstallment(loan.id, month, today);
          if (!result) continue;
          await this.notifier.notifyBySpace(
            loan.spaceId,
            result.outstanding <= 0
              ? `🎉 ${label}的最後一期 ${fmt(result.paid)} 已自動記好（${accountName}），這筆全部還清了！`
              : `✅ 這個月${label} ${fmt(result.paid)} 已自動記好（${accountName}），還剩 ${fmt(result.outstanding)}。`,
          );
          continue;
        }
        const next = nextInstallmentDate(today, day, loan.installmentLastMonth);
        if (daysBetween(today, next) !== 3) continue;
        const key = `${next}:3`;
        if (loan.installmentReminderKey === key) continue;
        await this.prisma.financeLoan.update({ where: { id: loan.id }, data: { installmentReminderKey: key } });
        const [, m, d] = next.split('-').map(Number);
        await this.notifier.notifyBySpace(
          loan.spaceId,
          `💰 ${m}/${d}（3 天後）${label} ${fmt(loan.installmentAmount!)}，會從「${accountName}」記一筆，記得帳戶裡留夠錢。`,
        );
      } catch (error) {
        this.logger.error(`借貸每月還款失敗（${loan.counterpartyName}）`, error);
      }
    }
  }
}
