import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';
import { StockTransactionType } from '../../generated/prisma/client.js';

const ZERO_SHARES_EPSILON = 0.0001;

/** 持股快取 (2026-08-05) — `list()` used to recompute EVERY stock code's
 * entire average-cost-basis history from scratch on every single read
 * (home dashboard widget, LINE 持股總覽, App 持股總覽 tab — all of them),
 * the same unbounded-query class of problem fixed elsewhere for
 * 知識庫/代辦事項, except here pagination can't fix it: average-cost-basis
 * is genuinely order-dependent (hand-verified — the same set of buy/sell
 * transactions in a different order produces a different final cost
 * basis), so there's no way to bound the read cost without materializing
 * the running state somewhere. `recompute` is the one place that does the
 * real (bounded-to-one-stockCode) history walk now; `list` just reads the
 * cache table. Every write path that touches a `StockTransaction` MUST
 * call `recompute` for the affected stockCode(s) afterward — see
 * `StocksTransactionsService.create/update/remove` and
 * `StocksRecurringService.fulfillPendingReply`. Deliberately always a full
 * recompute rather than an "apply this new transaction's delta on top of
 * the cache" shortcut — a backfilled transaction can have ANY tradeDate
 * (see the earlier 借貸/股票 backfill discussion this same session), so a
 * newly-created row isn't guaranteed to be chronologically last; only a
 * full walk in `tradeDate` order is safe. */
@Injectable()
export class StocksHoldingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    let holdings = await this.prisma.stockHolding.findMany({ where: { spaceId } });

    // Self-heal: a space with real trade history but zero cache rows means
    // this space's cache was never populated (the migration that added
    // `StockHolding` doesn't backfill existing production data — there's
    // no backfill script run against it, this IS the backfill) — recompute
    // every stock code this space has ever traded, once, the first time
    // anyone reads it after this feature shipped. Every read after that is
    // a plain cache-table read again.
    if (holdings.length === 0) {
      const traded = await this.prisma.stockTransaction.findMany({
        where: { spaceId },
        distinct: ['stockCode'],
        select: { stockCode: true },
      });
      for (const { stockCode } of traded) {
        await this.recompute(spaceId, stockCode);
      }
      if (traded.length > 0) {
        holdings = await this.prisma.stockHolding.findMany({ where: { spaceId } });
      }
    }

    if (holdings.length === 0) return [];

    const prices = await this.prisma.stockPriceCache.findMany({
      where: { stockCode: { in: holdings.map((h) => h.stockCode) } },
    });
    const priceByCode = new Map(prices.map((p) => [p.stockCode, p]));

    return holdings.map((h) => {
      const price = priceByCode.get(h.stockCode);
      const currentPrice = price?.intradayPrice ?? price?.dailyClosePrice ?? null;
      const marketValue = currentPrice != null ? h.shares * currentPrice : null;
      return {
        stockCode: h.stockCode,
        stockName: price?.stockName ?? null,
        shares: h.shares,
        costBasis: h.costBasis,
        averageCost: h.costBasis / h.shares,
        currentPrice,
        marketValue,
        gainLoss: marketValue != null ? marketValue - h.costBasis : null,
      };
    });
  }

  /** Full average-cost-basis walk for exactly one (spaceId, stockCode) —
   * bounded to that stock's own trade history, not the whole space's.
   * Upserts the cache row, or deletes it once shares round to ~0 (so
   * `list()` never has to filter zero-share rows itself). */
  async recompute(spaceId: string, stockCode: string): Promise<void> {
    const transactions = await this.prisma.stockTransaction.findMany({
      where: { spaceId, stockCode },
      orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }],
    });

    let shares = 0;
    let costBasis = 0;
    for (const t of transactions) {
      if (t.type === StockTransactionType.BUY) {
        shares += t.shares;
        costBasis += t.totalCost;
      } else {
        const sellShares = Math.min(t.shares, shares);
        const costRemoved = shares > 0 ? (sellShares / shares) * costBasis : 0;
        shares -= sellShares;
        costBasis -= costRemoved;
      }
    }

    if (shares <= ZERO_SHARES_EPSILON) {
      await this.prisma.stockHolding.deleteMany({ where: { spaceId, stockCode } });
      return;
    }

    await this.prisma.stockHolding.upsert({
      where: { spaceId_stockCode: { spaceId, stockCode } },
      create: { spaceId, stockCode, shares, costBasis },
      update: { shares, costBasis },
    });
  }
}
