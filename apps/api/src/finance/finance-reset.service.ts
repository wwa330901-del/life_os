import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import { FinanceAccessService } from './finance-access.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { ResetFinanceDto } from './dto/reset-finance.dto';

/** 清空記帳重來（2026-10-06）：很久沒記、帳對不起來時，一次刪掉所有紀錄——
 * 交易、借貸（含互通邀請、還款）、代墊、股票交易（持股留設定時變成期初持股）、淨資產趨勢、提醒紀錄、
 * 理財評估。帳戶留著時，餘額改成使用者填的現在實際金額（沒填就維持現在的數字），
 * 這樣刪掉交易後餘額不會跳掉。購物車、退休試算、人生目標不動。 */
@Injectable()
export class FinanceResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly accounts: FinanceAccountsService,
  ) {}

  async reset(userId: string, spaceId: string, dto: ResetFinanceDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const current = dto.deleteSetup ? [] : await this.accounts.list(userId, spaceId);
    // 留設定時，現在的持股變成期初持股（跟帳戶餘額改成現在金額同一個道理）。
    const holdings = dto.deleteSetup ? [] : await this.prisma.stockHolding.findMany({ where: { spaceId } });
    const wanted = new Map((dto.balances ?? []).map((b) => [b.accountId, b.balance]));

    const where = { spaceId };
    const ops: Prisma.PrismaPromise<unknown>[] = [
      // 借貸/代墊刪掉會連帶刪掉它們的交易、還款、互通邀請。
      this.prisma.financeLoan.deleteMany({ where }),
      this.prisma.financeAdvance.deleteMany({ where }),
      this.prisma.financeTransaction.deleteMany({ where }),
      this.prisma.stockTransaction.deleteMany({ where }),
      this.prisma.stockHolding.deleteMany({ where }),
      this.prisma.stockOpeningPosition.deleteMany({ where }),
      this.prisma.financeNetWorthSnapshot.deleteMany({ where }),
      this.prisma.financeAlertLog.deleteMany({ where }),
      this.prisma.space.update({
        where: { id: spaceId },
        data: { financePlan: Prisma.DbNull, financePlanAt: null },
      }),
    ];
    if (dto.deleteSetup) {
      // 帳戶刪掉會連帶刪掉定期交易、定期定額；人生目標的追蹤帳戶變成沒設定。
      ops.push(
        this.prisma.financeRecurringTransaction.deleteMany({ where }),
        this.prisma.stockRecurringInvestment.deleteMany({ where }),
        this.prisma.financeAccount.deleteMany({ where }),
        this.prisma.financeBudget.deleteMany({ where }),
        this.prisma.financeCategory.deleteMany({ where }),
      );
    } else {
      ops.push(this.prisma.stockRecurringInvestment.updateMany({ where, data: { awaitingReply: false } }));
      if (holdings.length > 0) {
        ops.push(
          this.prisma.stockOpeningPosition.createMany({
            data: holdings.map((h) => ({ spaceId, stockCode: h.stockCode, shares: h.shares, totalCost: h.costBasis })),
          }),
          this.prisma.stockHolding.createMany({
            data: holdings.map((h) => ({ spaceId, stockCode: h.stockCode, shares: h.shares, costBasis: h.costBasis })),
          }),
        );
      }
      for (const a of current) {
        ops.push(
          this.prisma.financeAccount.update({
            where: { id: a.id },
            data: { initialBalance: wanted.get(a.id) ?? a.balance, cardReminderKey: null },
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);
    return { ok: true };
  }
}
