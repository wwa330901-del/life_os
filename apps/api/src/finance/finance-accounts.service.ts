import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { UpdateFinanceAccountDto } from './dto/update-finance-account.dto';

@Injectable()
export class FinanceAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
  ) {}

  /** Every account's current balance is derived (initialBalance plus every
   * transaction against it) rather than stored, so it can never drift out
   * of sync with the transaction log. */
  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId },
      orderBy: { sortOrder: 'asc' },
    });
    const deltas = await this.computeBalanceDeltas(spaceId);
    return accounts.map((a) => ({ ...a, balance: a.initialBalance + (deltas.get(a.id) ?? 0) }));
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceAccountDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const maxSortOrder = await this.prisma.financeAccount.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return this.prisma.financeAccount.create({
      data: {
        spaceId,
        name: dto.name,
        type: dto.type,
        initialBalance: dto.initialBalance ?? 0,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(userId: string, spaceId: string, id: string, dto: UpdateFinanceAccountDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    return this.prisma.financeAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.initialBalance !== undefined && { initialBalance: dto.initialBalance }),
      },
    });
  }

  /** Deleting an account cascades to every transaction that touches it
   * (including as the destination side of a transfer) — acceptable for a
   * personal-scale ledger, and matches "removing this account" reading as
   * "forget this account ever existed" rather than leaving orphaned rows. */
  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, id);
    await this.prisma.financeAccount.delete({ where: { id } });
  }

  private async getOrThrow(spaceId: string, id: string) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id } });
    if (!account || account.spaceId !== spaceId) {
      throw new NotFoundException('Finance account not found');
    }
    return account;
  }

  /** Used to fetch every transaction the space had ever had and sum them in
   * Node — the hottest, fastest-growing unbounded query in the app (every
   * 記帳 screen open, every LINE 記帳/財務總覽 command hits this). Since a
   * plain linear sum-per-(account,type) has no order dependency (unlike
   * stock holdings' average-cost-basis, which does — see
   * `StocksHoldingsService`, deliberately NOT rewritten this way), it's
   * safe to push the summation into two grouped DB aggregates instead:
   * bounded by (account count × transaction type count), not by how many
   * transactions have ever been recorded. */
  private async computeBalanceDeltas(spaceId: string): Promise<Map<string, number>> {
    const deltas = new Map<string, number>();
    const add = (accountId: string, amount: number) =>
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + amount);

    const bySourceAccount = await this.prisma.financeTransaction.groupBy({
      by: ['accountId', 'type'],
      where: { spaceId },
      _sum: { amount: true },
    });
    for (const row of bySourceAccount) {
      const sum = row._sum.amount ?? 0;
      if (
        row.type === FinanceTransactionType.INCOME ||
        row.type === FinanceTransactionType.LOAN_IN ||
        row.type === FinanceTransactionType.ADVANCE_IN
      ) {
        add(row.accountId, sum);
      } else {
        // EXPENSE/LOAN_OUT/ADVANCE_OUT/TRANSFER all debit the source
        // account — TRANSFER's credit to the destination side is a
        // separate query below, since `groupBy` can only bucket by one FK
        // column at a time.
        add(row.accountId, -sum);
      }
    }

    const transferDestinations = await this.prisma.financeTransaction.groupBy({
      by: ['toAccountId'],
      where: { spaceId, type: FinanceTransactionType.TRANSFER, toAccountId: { not: null } },
      _sum: { amount: true },
    });
    for (const row of transferDestinations) {
      if (row.toAccountId) add(row.toAccountId, row._sum.amount ?? 0);
    }

    return deltas;
  }
}
