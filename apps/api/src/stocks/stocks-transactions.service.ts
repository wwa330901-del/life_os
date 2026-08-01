import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { computeSettlementDate } from './stock-settlement-schedule';

@Injectable()
export class StocksTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    return this.prisma.stockTransaction.findMany({
      where: { spaceId },
      orderBy: { tradeDate: 'desc' },
    });
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
