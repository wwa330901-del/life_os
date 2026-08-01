import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { StockTransactionType } from '../../generated/prisma/client.js';

@Injectable()
export class StocksHoldingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
  ) {}

  /// Per-stock holdings derived from every transaction against this space
  /// (settled or not — a pending T+2 trade still represents a real position
  /// you hold) using the average-cost-basis method: each BUY adds to both
  /// shares and cost basis, each SELL removes shares and a proportional
  /// slice of the cost basis (not the literal price paid at that sell).
  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const transactions = await this.prisma.stockTransaction.findMany({
      where: { spaceId },
      orderBy: { tradeDate: 'asc' },
    });

    const byCode = new Map<string, { shares: number; costBasis: number }>();
    for (const t of transactions) {
      const entry = byCode.get(t.stockCode) ?? { shares: 0, costBasis: 0 };
      if (t.type === StockTransactionType.BUY) {
        entry.shares += t.shares;
        entry.costBasis += t.totalCost;
      } else {
        const sellShares = Math.min(t.shares, entry.shares);
        const costRemoved = entry.shares > 0 ? (sellShares / entry.shares) * entry.costBasis : 0;
        entry.shares -= sellShares;
        entry.costBasis -= costRemoved;
      }
      byCode.set(t.stockCode, entry);
    }

    const codes = [...byCode.keys()].filter((code) => byCode.get(code)!.shares > 0.0001);
    const prices = await this.prisma.stockPriceCache.findMany({ where: { stockCode: { in: codes } } });
    const priceByCode = new Map(prices.map((p) => [p.stockCode, p]));

    return codes.map((code) => {
      const entry = byCode.get(code)!;
      const price = priceByCode.get(code);
      const currentPrice = price?.intradayPrice ?? price?.dailyClosePrice ?? null;
      const marketValue = currentPrice != null ? entry.shares * currentPrice : null;
      return {
        stockCode: code,
        stockName: price?.stockName ?? null,
        shares: entry.shares,
        costBasis: entry.costBasis,
        averageCost: entry.costBasis / entry.shares,
        currentPrice,
        marketValue,
        gainLoss: marketValue != null ? marketValue - entry.costBasis : null,
      };
    });
  }
}
