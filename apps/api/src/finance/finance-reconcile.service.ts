import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceAccountsService } from './finance-accounts.service';
import { FinanceCategoryKind, FinanceTransactionType } from '../../generated/prisma/client.js';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { planReconcile, reconcileNote } from './finance-reconcile';

/** 平帳：填帳戶現在實際有多少，差額記一筆「忘記記帳」／「多出來的錢」，之前的帳不動。 */
@Injectable()
export class FinanceReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly accounts: FinanceAccountsService,
  ) {}

  /** 算出平帳會記什麼（不寫入），給 App 預覽、AI 提議用。 */
  async preview(userId: string, spaceId: string, accountId: string, actualBalance: number) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const account = await this.prisma.financeAccount.findFirst({ where: { id: accountId, spaceId } });
    if (!account) throw new NotFoundException('找不到這個帳戶');
    const bookBalance = (await this.accounts.balanceOf(spaceId, accountId)) ?? 0;
    return { account, bookBalance, actualBalance, plan: planReconcile(bookBalance, actualBalance) };
  }

  async reconcile(userId: string, spaceId: string, accountId: string, actualBalance: number, date?: string) {
    if (!Number.isFinite(actualBalance)) throw new BadRequestException('實際金額要是數字');
    const { account, bookBalance, plan } = await this.preview(userId, spaceId, accountId, actualBalance);
    if (!plan) throw new BadRequestException(`「${account.name}」帳上就是 ${Math.round(bookBalance)}，不用平帳`);
    const day = taipeiDateKeyToUtcMidnight(date ?? taipeiDateKey(new Date()));
    const categoryId = await this.categoryId(spaceId, plan.categoryName, plan.type === 'EXPENSE' ? FinanceCategoryKind.EXPENSE : FinanceCategoryKind.INCOME);

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financeTransaction.create({
        data: {
          spaceId,
          type: plan.type === 'EXPENSE' ? FinanceTransactionType.EXPENSE : FinanceTransactionType.INCOME,
          amount: plan.amount,
          accountId,
          categoryId,
          date: day,
          note: reconcileNote(bookBalance, actualBalance),
        },
      });
      const record = await tx.financeReconciliation.create({
        data: { spaceId, accountId, date: day, bookBalance, actualBalance, difference: plan.difference, transactionId: transaction.id },
      });
      return { ...record, accountName: account.name, categoryName: plan.categoryName };
    });
  }

  /** 平帳紀錄（新到舊）＋今年每個帳戶忘記記多少。 */
  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const rows = await this.prisma.financeReconciliation.findMany({
      where: { spaceId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { account: { select: { name: true } } },
    });
    const year = taipeiDateKey(new Date()).slice(0, 4);
    const thisYear = new Map<string, number>();
    for (const r of rows) {
      if (r.date.toISOString().slice(0, 4) !== year) continue;
      thisYear.set(r.account.name, (thisYear.get(r.account.name) ?? 0) + r.difference);
    }
    return {
      items: rows.map(({ account, ...r }) => ({ ...r, accountName: account.name })),
      thisYear: [...thisYear].map(([accountName, difference]) => ({ accountName, difference })),
    };
  }

  /** 找這個名字的分類，沒有就建一個（放最後面）。 */
  private async categoryId(spaceId: string, name: string, kind: FinanceCategoryKind) {
    const existing = await this.prisma.financeCategory.findFirst({ where: { spaceId, name, kind } });
    if (existing) return existing.id;
    const max = await this.prisma.financeCategory.aggregate({ where: { spaceId }, _max: { sortOrder: true } });
    const created = await this.prisma.financeCategory.create({
      data: { spaceId, name, kind, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    return created.id;
  }
}
