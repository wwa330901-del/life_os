import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { UpdateStockTransactionDto } from './dto/update-stock-transaction.dto';
import { computeSettlementDate } from './stock-settlement-schedule';

@Injectable()
export class StocksTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
  ) {}

  /** Cursor-paginated (30/page) — used to fetch this space's entire trade
   * history unconditionally, the same unbounded-list problem fixed
   * elsewhere for 知識庫/代辦事項/文件簽核 (see 大系統V1.46.0). Unlike
   * `StocksHoldingsService.list`, which reads the full history itself to
   * compute average-cost-basis (order-dependent, can't be paginated away —
   * left alone, deliberately), this is just a display list with nothing
   * downstream depending on it being complete. */
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

  /// `shares` is always derived (`totalCost / pricePerShare`) — the caller
  /// only ever supplies price and total cost, same convention as a DCA
  /// fill-in. `settlementDate` is computed once at creation (T+2) and never
  /// recomputed, so editing the holiday calendar later can't retroactively
  /// shift a trade that already has a settlement date on record.
  async create(userId: string, spaceId: string, dto: CreateStockTransactionDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);

    const tradeDate = new Date(dto.tradeDate);
    return this.prisma.stockTransaction.create({
      data: {
        spaceId,
        stockCode: dto.stockCode,
        type: dto.type,
        pricePerShare: dto.pricePerShare,
        totalCost: dto.totalCost,
        shares: dto.totalCost / dto.pricePerShare,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
        accountId: dto.accountId,
        note: dto.note,
      },
    });
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
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);

    const pricePerShare = dto.pricePerShare ?? existing.pricePerShare;
    const totalCost = dto.totalCost ?? existing.totalCost;
    const tradeDate = dto.tradeDate ? new Date(dto.tradeDate) : existing.tradeDate;

    return this.prisma.stockTransaction.update({
      where: { id },
      data: {
        ...(dto.stockCode !== undefined && { stockCode: dto.stockCode }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.note !== undefined && { note: dto.note }),
        pricePerShare,
        totalCost,
        shares: totalCost / pricePerShare,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
      },
    });
  }

  /// Deletion is blocked once a trade has settled — the real
  /// FinanceTransaction it produced already moved money, so removing the
  /// stock-side record afterwards would desync the two instead of undoing
  /// anything (the finance transaction would have to be deleted too, and
  /// there's no user-facing "undo settlement" flow).
  async remove(userId: string, spaceId: string, id: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const existing = await this.getOrThrow(spaceId, id);
    if (existing.settled) {
      throw new BadRequestException('已交割的股票交易不能刪除');
    }
    await this.prisma.stockTransaction.delete({ where: { id } });
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
