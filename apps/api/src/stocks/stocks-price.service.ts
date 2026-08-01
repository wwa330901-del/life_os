import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { isTaiwanHoliday } from '../projects/scheduling/taiwan-holiday-calendar';

interface TwseStockDayRow {
  Code: string;
  Name: string;
  ClosingPrice: string;
}

interface TwseMisRow {
  c: string; // 股票代碼
  n: string; // 股票名稱
  z: string; // 最近成交價 ("-" when no trade yet today)
}

/** 股價快取更新 — 每日收盤後用證交所官方 OpenAPI 抓一次收盤價（穩定、免費、
 * 有文件規格），開盤時段額外嘗試用非官方即時報價介面更新，拉不到就維持上次
 * 的值，UI 端會自動退回顯示收盤價，不會壞掉。兩個 cron 都只處理「目前有人
 * 持有或設定定期定額」的股票代碼，不會對整個台股清單發出請求。 */
@Injectable()
export class StocksPriceService {
  private readonly logger = new Logger(StocksPriceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 14:30 Asia/Taipei, weekdays — after the market's own close. */
  @Cron('30 14 * * 1-5', { timeZone: 'Asia/Taipei' })
  async refreshDailyClose() {
    const today = taipeiDateOnly(new Date());
    if (isTaiwanHoliday(today)) return;

    const codes = await this.trackedStockCodes();
    if (codes.length === 0) return;

    try {
      const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
      if (!res.ok) throw new Error(`TWSE STOCK_DAY_ALL 回應 ${res.status}`);
      const rows = (await res.json()) as TwseStockDayRow[];
      const rowByCode = new Map(rows.map((r) => [r.Code, r]));

      for (const code of codes) {
        const row = rowByCode.get(code);
        if (!row) continue;
        const price = Number(row.ClosingPrice.replace(/,/g, ''));
        if (!Number.isFinite(price) || price <= 0) continue;
        await this.prisma.stockPriceCache.upsert({
          where: { stockCode: code },
          create: { stockCode: code, stockName: row.Name, dailyClosePrice: price, dailyCloseDate: today },
          update: { stockName: row.Name, dailyClosePrice: price, dailyCloseDate: today },
        });
      }
    } catch (error) {
      this.logger.error('每日收盤價更新失敗', error);
    }
  }

  /** Every 5 minutes, 09:00-13:30 Asia/Taipei, weekdays — the cron pattern
   * only bounds the hour to 9-13, so the handler itself checks the 13:30
   * cutoff and skips Taiwan public holidays the pattern can't express. */
  @Cron('*/5 9-13 * * 1-5', { timeZone: 'Asia/Taipei' })
  async refreshIntradayPrices() {
    const now = new Date();
    if (isTaiwanHoliday(taipeiDateOnly(now)) || !this.isBeforeMarketClose(now)) return;

    const codes = await this.trackedStockCodes();
    if (codes.length === 0) return;

    try {
      const query = codes.map((c) => `tse_${c}.tw`).join('|');
      const res = await fetch(
        `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${query}&json=1&_=${Date.now()}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
      );
      if (!res.ok) throw new Error(`TWSE MIS 回應 ${res.status}`);
      const body = (await res.json()) as { msgArray?: TwseMisRow[] };
      const updatedAt = new Date();

      for (const item of body.msgArray ?? []) {
        const price = Number(item.z);
        if (!Number.isFinite(price) || price <= 0) continue;
        await this.prisma.stockPriceCache.upsert({
          where: { stockCode: item.c },
          create: { stockCode: item.c, stockName: item.n, intradayPrice: price, intradayUpdatedAt: updatedAt },
          update: { stockName: item.n, intradayPrice: price, intradayUpdatedAt: updatedAt },
        });
      }
    } catch (error) {
      // Unofficial, unversioned endpoint — an occasional failure here is
      // expected and just means the UI falls back to yesterday's official
      // close; warn rather than error, and never let it affect the
      // official daily-close cache above.
      this.logger.warn('盤中即時股價更新失敗（非官方介面，屬預期內狀況）', error);
    }
  }

  private isBeforeMarketClose(now: Date): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')!.value);
    const minute = Number(parts.find((p) => p.type === 'minute')!.value);
    return hour * 60 + minute <= 13 * 60 + 30;
  }

  private async trackedStockCodes(): Promise<string[]> {
    const [fromTransactions, fromPlans] = await Promise.all([
      this.prisma.stockTransaction.findMany({ distinct: ['stockCode'], select: { stockCode: true } }),
      this.prisma.stockRecurringInvestment.findMany({
        where: { active: true },
        distinct: ['stockCode'],
        select: { stockCode: true },
      }),
    ]);
    return [...new Set([...fromTransactions.map((t) => t.stockCode), ...fromPlans.map((p) => p.stockCode)])];
  }
}

/** Taiwan-local calendar date, UTC-midnight-normalized — matches how
 * Postgres DATE columns round-trip through Prisma (see holiday-calendar.ts's
 * normalizeDate) and how isTaiwanHoliday expects its input. */
function taipeiDateOnly(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const day = Number(parts.find((p) => p.type === 'day')!.value);
  return new Date(Date.UTC(year, month - 1, day));
}
