import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { UpsertFinanceBudgetDto } from './dto/upsert-finance-budget.dto';

@Injectable()
export class FinanceBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.prisma.financeBudget.findMany({
      where: { spaceId },
      include: { category: true },
    });
  }

  /** One budget per category — setting it again for the same category
   * replaces the previous amount instead of creating a duplicate row. */
  async upsert(userId: string, spaceId: string, dto: UpsertFinanceBudgetDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const category = await this.prisma.financeCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || category.spaceId !== spaceId) {
      throw new NotFoundException('Finance category not found');
    }
    return this.prisma.financeBudget.upsert({
      where: { categoryId: dto.categoryId },
      create: { spaceId, categoryId: dto.categoryId, monthlyAmount: dto.monthlyAmount },
      update: { monthlyAmount: dto.monthlyAmount },
    });
  }

  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const budget = await this.prisma.financeBudget.findUnique({ where: { id } });
    if (!budget || budget.spaceId !== spaceId) {
      throw new NotFoundException('Finance budget not found');
    }
    await this.prisma.financeBudget.delete({ where: { id } });
  }

  /** Budget vs. actual spend per category for one month — pairs each
   * budget with that month's EXPENSE total in the same category (0 if
   * nothing spent yet in that category). */
  async monthlyStatus(userId: string, spaceId: string, month: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const [budgets, spentByCategory] = await Promise.all([
      this.prisma.financeBudget.findMany({ where: { spaceId }, include: { category: true } }),
      this.monthlyExpenseByCategory(spaceId, month),
    ]);

    return budgets.map((b) => ({
      categoryId: b.categoryId,
      categoryName: b.category.name,
      monthlyAmount: b.monthlyAmount,
      spent: spentByCategory.get(b.categoryId) ?? 0,
    }));
  }

  /** Keyed by *both* a transaction's own category id and (if it has one)
   * its parent's id, so a budget set on either a 子分類 or its 母分類
   * finds the right total — transactions can only ever be filed under a
   * leaf category, but a budget is allowed at either level. */
  private async monthlyExpenseByCategory(spaceId: string, month: string): Promise<Map<string, number>> {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 1));
    const transactions = await this.prisma.financeTransaction.findMany({
      where: { spaceId, type: FinanceTransactionType.EXPENSE, date: { gte: start, lt: end } },
      include: { category: true },
    });
    const totals = new Map<string, number>();
    for (const t of transactions) {
      if (!t.categoryId) continue;
      totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
      const parentId = t.category?.parentId;
      if (parentId) {
        totals.set(parentId, (totals.get(parentId) ?? 0) + t.amount);
      }
    }
    return totals;
  }
}
