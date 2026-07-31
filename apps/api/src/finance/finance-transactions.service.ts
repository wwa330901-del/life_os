import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';

export interface ValidateInput {
  type: FinanceTransactionType;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
}

@Injectable()
export class FinanceTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly budgets: FinanceBudgetsService,
  ) {}

  /** `month` is "YYYY-MM"; omit to list everything, newest first. */
  async list(userId: string, spaceId: string, month?: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const range = month ? monthRange(month) : null;
    return this.prisma.financeTransaction.findMany({
      where: { spaceId, ...(range && { date: { gte: range.start, lt: range.end } }) },
      orderBy: { date: 'desc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.validate(spaceId, dto);
    const transaction = await this.prisma.financeTransaction.create({
      data: {
        spaceId,
        type: dto.type,
        amount: dto.amount,
        accountId: dto.accountId,
        toAccountId: dto.type === FinanceTransactionType.TRANSFER ? dto.toAccountId : null,
        categoryId: dto.type === FinanceTransactionType.TRANSFER ? null : dto.categoryId,
        date: new Date(dto.date),
        note: dto.note,
      },
    });
    if (transaction.type === FinanceTransactionType.EXPENSE && transaction.categoryId) {
      await this.budgets.notifyIfOverspent(spaceId, transaction.categoryId, transaction.date);
    }
    return transaction;
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateFinanceTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    const merged: ValidateInput = {
      type: dto.type ?? existing.type,
      accountId: dto.accountId ?? existing.accountId,
      toAccountId: dto.toAccountId !== undefined ? dto.toAccountId : existing.toAccountId,
      categoryId: dto.categoryId !== undefined ? dto.categoryId : existing.categoryId,
    };
    await this.validate(spaceId, merged);
    return this.prisma.financeTransaction.update({
      where: { id },
      data: {
        type: merged.type,
        accountId: merged.accountId,
        toAccountId: merged.type === FinanceTransactionType.TRANSFER ? merged.toAccountId : null,
        categoryId: merged.type === FinanceTransactionType.TRANSFER ? null : merged.categoryId,
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
  }

  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    await this.prisma.financeTransaction.delete({ where: { id } });
  }

  /** Per-category income/expense totals for one month, plus overall
   * totals — what the monthly chart renders. Transfers are excluded (they
   * don't represent income or spending, just moving money between the
   * user's own accounts). Rolled up to 母分類: a transaction filed under a
   * 子分類 counts toward its parent's total here, never the child's own —
   * 子分類 only shows up broken out in the transaction list itself. */
  async monthlySummary(userId: string, spaceId: string, month: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const range = monthRange(month);
    const transactions = await this.prisma.financeTransaction.findMany({
      where: {
        spaceId,
        date: { gte: range.start, lt: range.end },
        type: { in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE] },
      },
      include: { category: { include: { parent: true } } },
    });

    const byCategory = new Map<
      string,
      { categoryId: string | null; name: string; kind: FinanceTransactionType; total: number }
    >();
    let totalIncome = 0;
    let totalExpense = 0;

    for (const t of transactions) {
      if (t.type === FinanceTransactionType.INCOME) totalIncome += t.amount;
      else totalExpense += t.amount;

      // Roll up to the 母分類 (or the category itself if it has none).
      const rollupCategory = t.category?.parent ?? t.category;
      const key = rollupCategory?.id ?? `uncategorized-${t.type}`;
      const entry = byCategory.get(key) ?? {
        categoryId: rollupCategory?.id ?? null,
        name: rollupCategory?.name ?? '未分類',
        kind: t.type,
        total: 0,
      };
      entry.total += t.amount;
      byCategory.set(key, entry);
    }

    return {
      month,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      byCategory: [...byCategory.values()],
    };
  }

  private async getOrThrow(spaceId: string, id: string) {
    const transaction = await this.prisma.financeTransaction.findUnique({ where: { id } });
    if (!transaction || transaction.spaceId !== spaceId) {
      throw new NotFoundException('Finance transaction not found');
    }
    return transaction;
  }

  /** Shared with `FinanceRecurringTransactionsService` — a recurring entry
   * needs the exact same account/category rules a one-off transaction
   * does, just without a `date`/`amount` to check. */
  async validate(spaceId: string, input: ValidateInput) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.spaceId !== spaceId) {
      throw new BadRequestException('帳戶不存在');
    }

    if (input.type === FinanceTransactionType.TRANSFER) {
      if (!input.toAccountId) {
        throw new BadRequestException('轉帳需要指定目標帳戶');
      }
      if (input.toAccountId === input.accountId) {
        throw new BadRequestException('轉帳的來源跟目標帳戶不能相同');
      }
      const toAccount = await this.prisma.financeAccount.findUnique({
        where: { id: input.toAccountId },
      });
      if (!toAccount || toAccount.spaceId !== spaceId) {
        throw new BadRequestException('目標帳戶不存在');
      }
    } else if (input.categoryId) {
      const category = await this.prisma.financeCategory.findUnique({
        where: { id: input.categoryId },
        include: { _count: { select: { children: true } } },
      });
      if (!category || category.spaceId !== spaceId) {
        throw new BadRequestException('分類不存在');
      }
      if (category._count.children > 0) {
        throw new BadRequestException('這個分類底下有子分類，記帳時要選子分類，不能直接選母分類');
      }
    }
  }
}

function monthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = new Date(Date.UTC(year, m, 1));
  return { start, end };
}
