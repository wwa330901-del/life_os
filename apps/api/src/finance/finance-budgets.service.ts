import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { UpsertFinanceBudgetDto } from './dto/upsert-finance-budget.dto';

@Injectable()
export class FinanceBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly lineNotifier: LineNotifierService,
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

  /** Fires right after a new EXPENSE transaction is saved (from the app or
   * from LINE 記帳 — both call this) — checks whether *that* transaction's
   * category (or its 母分類, since budgets only live on the parent) just
   * pushed the month over budget, and pushes a LINE alert if so. Only
   * meaningful for a category that actually has a budget set; a no-op
   * otherwise. Doesn't distinguish "just crossed the line" from "already
   * way over" — every EXPENSE against an over-budget category re-notifies,
   * which is deliberately noisy (the user is actively overspending, better
   * to over-remind than let it go quiet). */
  async notifyIfOverspent(spaceId: string, categoryId: string, date: Date): Promise<void> {
    const category = await this.prisma.financeCategory.findUnique({ where: { id: categoryId } });
    if (!category) return;
    const rollupCategoryId = category.parentId ?? category.id;

    const budget = await this.prisma.financeBudget.findUnique({
      where: { categoryId: rollupCategoryId },
      include: { category: true },
    });
    if (!budget) return;

    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const spentByCategory = await this.monthlyExpenseByCategory(spaceId, month);
    const spent = spentByCategory.get(rollupCategoryId) ?? 0;
    if (spent <= budget.monthlyAmount) return;

    await this.lineNotifier.notifyBySpace(
      spaceId,
      `⚠️ 「${budget.category.name}」本月已超出預算（已花費 ${Math.round(spent).toLocaleString('en-US')} / 預算 ${Math.round(budget.monthlyAmount).toLocaleString('en-US')}）`,
    );
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
