import { Injectable, Logger } from '@nestjs/common';

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volumeLots: number; // 張
}

interface TwseStockDayResponse {
  stat: string;
  data?: string[][];
}

interface TpexStockDayResponse {
  tables?: Array<{ data?: string[][] }>;
}

const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000;

/** 個股日成交歷史 — 給 LINE AI 分析持股走向用。先查證交所（上市），沒有資料
 * 再查櫃買中心（上櫃），兩個都是官方免費公開資料，一次一個月。已經過完的
 * 月份不會再變，永久快取在記憶體；當月快取一小時。 */
@Injectable()
export class StockHistoryService {
  private readonly logger = new Logger(StockHistoryService.name);
  private readonly cache = new Map<string, { bars: DailyBar[]; fetchedAt: number; final: boolean }>();

  /** Oldest first, covering the last `months` calendar months (incl. this one). */
  async daily(stockCode: string, months: number): Promise<DailyBar[]> {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // Taipei wall clock
    const bars: DailyBar[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      bars.push(...(await this.month(stockCode, d.getUTCFullYear(), d.getUTCMonth() + 1, i > 0)));
    }
    return bars;
  }

  /** The most recent trading day's bar, bypassing the current-month cache —
   * for the daily close job, which must not reuse a pre-close fetch. Falls
   * back to last month on the first trading days of a month. */
  async latestBar(stockCode: string): Promise<DailyBar | null> {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // Taipei wall clock
    for (let i = 0; i <= 1; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const bars = await this.month(stockCode, d.getUTCFullYear(), d.getUTCMonth() + 1, i > 0, i === 0);
      if (bars.length > 0) return bars[bars.length - 1];
    }
    return null;
  }

  private async month(code: string, year: number, month: number, final: boolean, fresh = false): Promise<DailyBar[]> {
    const key = `${code}:${year}-${month}`;
    const hit = this.cache.get(key);
    if (!fresh && hit && (hit.final || Date.now() - hit.fetchedAt < CURRENT_MONTH_TTL_MS)) return hit.bars;

    let bars = await this.fetchTwse(code, year, month);
    if (bars.length === 0) bars = await this.fetchTpex(code, year, month);
    this.cache.set(key, { bars, fetchedAt: Date.now(), final: final && bars.length > 0 });
    return bars;
  }

  private async fetchTwse(code: string, year: number, month: number): Promise<DailyBar[]> {
    const date = `${year}${String(month).padStart(2, '0')}01`;
    try {
      const res = await fetch(
        `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${date}&stockNo=${encodeURIComponent(code)}&response=json`,
      );
      if (!res.ok) return [];
      const body = (await res.json()) as TwseStockDayResponse;
      if (body.stat !== 'OK' || !body.data) return [];
      // 成交股數 → 張
      return parseRows(body.data, (shares) => shares / 1000);
    } catch (error) {
      this.logger.warn(`證交所歷史股價抓取失敗 ${code} ${date}: ${String(error)}`);
      return [];
    }
  }

  private async fetchTpex(code: string, year: number, month: number): Promise<DailyBar[]> {
    const date = `${year}/${String(month).padStart(2, '0')}/01`;
    try {
      const res = await fetch(
        `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${encodeURIComponent(code)}&date=${date}&response=json`,
      );
      if (!res.ok) return [];
      const body = (await res.json()) as TpexStockDayResponse;
      const rows = body.tables?.[0]?.data;
      if (!rows) return [];
      // 已經是張
      return parseRows(rows, (lots) => lots);
    } catch (error) {
      this.logger.warn(`櫃買中心歷史股價抓取失敗 ${code} ${date}: ${String(error)}`);
      return [];
    }
  }
}

/** Both sources: [民國日期, 量, 金額, 開, 高, 低, 收, ...]. Rows with no trade
 * ("--") are skipped. */
function parseRows(rows: string[][], toLots: (volume: number) => number): DailyBar[] {
  const num = (s: string) => Number(s.replace(/,/g, ''));
  const bars: DailyBar[] = [];
  for (const row of rows) {
    const [roc, volume, , open, high, low, close] = row;
    const parts = roc.split('/').map(Number);
    if (parts.length !== 3 || !(num(close) > 0)) continue;
    const date = `${parts[0] + 1911}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    bars.push({ date, open: num(open), high: num(high), low: num(low), close: num(close), volumeLots: Math.round(toLots(num(volume))) });
  }
  return bars;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function movingAverage(closes: number[], days: number): number | null {
  return closes.length >= days ? round2(average(closes.slice(-days))) : null;
}

function changePct(closes: number[], daysAgo: number): number | null {
  if (closes.length <= daysAgo) return null;
  const past = closes[closes.length - 1 - daysAgo];
  return round2(((closes[closes.length - 1] - past) / past) * 100);
}

/** Objective numbers the model reasons over — computed here so the AI
 * never has to do arithmetic on raw price rows. */
export function summarizeTrend(bars: DailyBar[]) {
  if (bars.length === 0) return null;
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const dailyReturns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const recent20 = dailyReturns.slice(-20);
  const volatility =
    recent20.length >= 2
      ? round2(Math.sqrt(average(recent20.map((r) => (r - average(recent20)) ** 2))) * 100)
      : null;
  const vol5 = bars.slice(-5).map((b) => b.volumeLots);
  const vol20 = bars.slice(-20).map((b) => b.volumeLots);
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  return {
    latestDate: last.date,
    latestClose: last.close,
    change5dPct: changePct(closes, 5),
    change20dPct: changePct(closes, 20),
    change60dPct: changePct(closes, 60),
    ma5: movingAverage(closes, 5),
    ma20: movingAverage(closes, 20),
    ma60: movingAverage(closes, 60),
    periodHigh: high,
    periodLow: low,
    fromHighPct: round2(((last.close - high) / high) * 100),
    dailyVolatility20dPct: volatility,
    avgVolume5dLots: vol5.length ? Math.round(average(vol5)) : null,
    avgVolume20dLots: vol20.length ? Math.round(average(vol20)) : null,
    tradingDays: bars.length,
    // 最近 10 天收盤，讓模型看得到短線樣子，但不用整段原始資料。
    recentCloses: bars.slice(-10).map((b) => ({ date: b.date, close: b.close })),
  };
}
