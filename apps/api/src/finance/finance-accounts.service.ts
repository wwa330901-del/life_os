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

  private async computeBalanceDeltas(spaceId: string): Promise<Map<string, number>> {
    const transactions = await this.prisma.financeTransaction.findMany({ where: { spaceId } });
    const deltas = new Map<string, number>();
    const add = (accountId: string, amount: number) =>
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + amount);

    for (const t of transactions) {
      if (t.type === FinanceTransactionType.INCOME) {
        add(t.accountId, t.amount);
      } else if (t.type === FinanceTransactionType.EXPENSE) {
        add(t.accountId, -t.amount);
      } else if (t.type === FinanceTransactionType.TRANSFER) {
        add(t.accountId, -t.amount);
        if (t.toAccountId) add(t.toAccountId, t.amount);
      }
    }
    return deltas;
  }
}
