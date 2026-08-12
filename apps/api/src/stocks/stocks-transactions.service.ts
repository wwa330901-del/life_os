import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { StocksHoldingsService } from './stocks-holdings.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { UpdateStockTransactionDto } from './dto/update-stock-transaction.dto';
import { computeSettlementDate } from './stock-settlement-schedule';

@Injectable()
export class StocksTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
    private readonly holdings: StocksHoldingsService,
  ) {}

  /** Cursor-paginated (30/page) — used to fetch this space's entire trade
   * history unconditionally, the same unbounded-list problem fixed
   * elsewhere for 知識庫/代辦事項/文件簽核 (see 大系統V1.46.0). Unlike
   * `StocksHoldingsService.list`, which now reads from the persisted
   * `StockHolding` cache (see 大系統V1.53.0) rather than recomputing full
   * history, this is just a display list with nothing downstream depending
   * on it being complete. */
  async list(userId: string, spaceId: string, filter: { cursor?: string } = {}) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const take = 30;
    const rows = await this.prisma.stockTransaction.findMany({
      where: { spaceId },
      orderBy: [{ tradeDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  /// `totalCost` is always derived (`pricePerShare * shares`) — the caller
  /// only ever supplies price and share count, matching what a real broker
  /// trade confirmation actually tells you. `settlementDate` is computed
  /// once at creation (T+2) and never recomputed, so editing the holiday
  /// calendar later can't retroactively shift a trade that already has a
  /// settlement date on record.
  async create(userId: string, spaceId: string, dto: CreateStockTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);

    const tradeDate = new Date(dto.tradeDate);
    const transaction = await this.prisma.stockTransaction.create({
      data: {
        spaceId,
        stockCode: dto.stockCode,
        type: dto.type,
        pricePerShare: dto.pricePerShare,
        totalCost: dto.pricePerShare * dto.shares,
        shares: dto.shares,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
        accountId: dto.accountId,
        note: dto.note,
      },
    });
    await this.holdings.recompute(spaceId, dto.stockCode);
    return transaction;
  }

  /// Blocked once settled, same reasoning as `remove` below — the real
  /// FinanceTransaction it produced has no back-reference to this row (see
  /// `StocksSettlementService`), so editing amount/date/account after that
  /// point would silently desync from money that's already moved.
  /// `type` (買/賣) is deliberately not editable — that's a bigger
  /// semantic flip (changes EXPENSE↔INCOME at settlement); delete and
  /// re-enter instead if it's genuinely wrong, same as before this existed.
  async update(userId: string, spaceId: string, id: string, dto: UpdateStockTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    if (existing.settled) {
      throw new BadRequestException('已交割的股票交易不能修改');
    }
    if (existing.pending) {
      throw new BadRequestException('這是定期定額待填成交價的交易，請用「登記成交」填入成交價，不能直接編輯。');
    }
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);

    const pricePerShare = dto.pricePerShare ?? existing.pricePerShare;
    const shares = dto.shares ?? existing.shares;
    const tradeDate = dto.tradeDate ? new Date(dto.tradeDate) : existing.tradeDate;

    const updated = await this.prisma.stockTransaction.update({
      where: { id },
      data: {
        ...(dto.stockCode !== undefined && { stockCode: dto.stockCode }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.note !== undefined && { note: dto.note }),
        pricePerShare,
        shares,
        totalCost: pricePerShare * shares,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
      },
    });
    await this.holdings.recompute(spaceId, existing.stockCode);
    if (dto.stockCode !== undefined && dto.stockCode !== existing.stockCode) {
      await this.holdings.recompute(spaceId, dto.stockCode);
    }
    return updated;
  }

  /// Deletion is blocked once a trade has settled — the real
  /// FinanceTransaction it produced already moved money, so removing the
  /// stock-side record afterwards would desync the two instead of undoing
  /// anything (the finance transaction would have to be deleted too, and
  /// there's no user-facing "undo settlement" flow). Deleting a pending 定期
  /// 定額 row (never settled) IS allowed — that's "skip this period" — but
  /// its plan's `awaitingReply` has to be cleared too, otherwise the plan
  /// would be stuck forever thinking a reply is still outstanding for a row
  /// that no longer exists, and never remind again.
  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    if (existing.settled) {
      throw new BadRequestException('已交割的股票交易不能刪除');
    }
    await this.prisma.stockTransaction.delete({ where: { id } });
    if (existing.pending && existing.recurringInvestmentId) {
      await this.prisma.stockRecurringInvestment.update({
        where: { id: existing.recurringInvestmentId },
        data: { awaitingReply: false },
      });
    }
    await this.holdings.recompute(spaceId, existing.stockCode);
  }

  private async assertAccount(spaceId: string, accountId: string) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!account || account.spaceId !== spaceId) {
      throw new BadRequestException('帳戶不存在');
    }
  }

  private async getOrThrow(spaceId: string, id: string) {
    const row = await this.prisma.stockTransaction.findUnique({ where: { id } });
    if (!row || row.spaceId !== spaceId) {
      throw new NotFoundException('Stock transaction not found');
    }
    return row;
  }
}
