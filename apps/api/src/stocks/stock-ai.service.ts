import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksHoldingsService } from './stocks-holdings.service';
import { StocksTransactionsService } from './stocks-transactions.service';
import { StockHistoryService, summarizeTrend } from './stock-history.service';
import { StockFundamentalsService } from './stock-fundamentals.service';

const DEFAULT_TREND_MONTHS = 4; // 夠算 60 日均線
const MAX_TREND_MONTHS = 12;
const RECENT_TRANSACTIONS = 10;

/** Gemini Interactions API tool declarations for 股票 — composed into the
 * LINE 萬用 AI (`AiAgentService`). 2026-10-01 使用者要求 AI 要能看持股
 * 損益、分析持股走向（之前是刻意不給 AI 碰投資資料）。不會下單或記錄
 * 交易；唯一會寫的是 set_stock_opening（期初持股）。 */
export const STOCK_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_stock_portfolio',
    description:
      '使用者目前的持股：每檔的股數、平均成本、現價、市值、未實現損益與報酬率，加上總投入成本、總市值、總損益，以及最近幾筆股票交易。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'analyze_stock_trend',
    description:
      '抓某檔台股（上市或上櫃）的歷史日成交資料並算好走勢數據：5/20/60 日漲跌幅、5/20/60 日均線、區間高低點、離高點多遠、20 日波動度、成交量變化、最近 10 天收盤。使用者持有的話也會附上他的成本跟損益。',
    parameters: {
      type: 'object',
      properties: {
        stockCode: { type: 'string', description: '4-6 位數股票代碼，例如 2330、0050' },
        months: { type: 'number', description: `抓幾個月，預設 ${DEFAULT_TREND_MONTHS}，最多 ${MAX_TREND_MONTHS}` },
      },
      required: ['stockCode'],
    },
  },
  {
    type: 'function' as const,
    name: 'get_stock_fundamentals',
    description:
      '某檔台股的基本面與新聞：本益比、殖利率、股價淨值比，最新月營收（月增/年增/今年累計年增、公司說明），最新一季累計 EPS、營收、營業利益、稅後淨利（億元），以及最近 7 天新聞標題。ETF 沒有營收財報。',
    parameters: {
      type: 'object',
      properties: { stockCode: { type: 'string', description: '4-6 位數股票代碼' } },
      required: ['stockCode'],
    },
  },
  {
    type: 'function' as const,
    name: 'set_stock_opening',
    description:
      '設定期初持股：開始記帳前就有的股票（像帳戶的期初餘額，不會從任何帳戶扣錢）。「我本來就有 0050 1000 股，均價 150」。同一檔再設會覆蓋；shares=0 代表刪掉這檔的期初持股。這次之後才買賣的要記成交易，不是期初。',
    parameters: {
      type: 'object',
      properties: {
        stockCode: { type: 'string', description: '4-6 位數股票代碼' },
        shares: { type: 'number', description: '股數（1 張＝1000 股）' },
        averageCost: { type: 'number', description: '每股平均成本；沒講就先問' },
      },
      required: ['stockCode', 'shares'],
    },
  },
];

export const STOCK_AI_GUIDE = [
  '說本來就有某檔股票、補登原本的持股 → set_stock_opening（不是買進交易，不動帳戶）。問持股、損益、賺多少 → get_stock_portfolio。問某檔（或全部持股）走勢、怎麼看、要不要續抱 → analyze_stock_trend（全部持股就每檔都查），用算好的數據分析：短中期漲跌、股價在均線上還是下（多頭/空頭排列）、離高點多遠、波動大不大、量有沒有放大、跟他的成本比。',
  '要分析一檔股票（怎麼看、要不要續抱/加碼）時，analyze_stock_trend 看價格，再 get_stock_fundamentals 看基本面和新聞：本益比貴不貴、殖利率、營收是成長還是衰退、EPS、最近新聞是利多還利空，把價格面和基本面一起講。問「X 最近有什麼新聞」「營收怎樣」也用它。',
  '分析要具體、講數字，可以說偏多/偏空/盤整以及要留意的價位，但最後提醒一句這是依過去資料的分析、不保證未來，決定權在他。不要編造新聞或財報數字，工具沒給的就說沒有資料；新聞只有標題，不要自己補內容。',
].join('\n');

@Injectable()
export class StockAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holdings: StocksHoldingsService,
    private readonly transactions: StocksTransactionsService,
    private readonly history: StockHistoryService,
    private readonly fundamentals: StockFundamentalsService,
  ) {}

  static readonly toolNames = new Set(STOCK_TOOLS.map((t) => t.name));

  async execute(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) throw new Error('找不到個人空間，請先登入 App 一次');

    switch (name) {
      case 'get_stock_portfolio':
        return this.portfolio(userId, space.id);
      case 'analyze_stock_trend':
        return this.trend(userId, space.id, args);
      case 'get_stock_fundamentals': {
        const stockCode = String(args.stockCode ?? '').trim();
        if (!/^\d{4,6}[A-Z]?$/.test(stockCode)) throw new Error('股票代碼要是 4-6 位數字，例如 2330');
        return this.fundamentals.get(stockCode);
      }
      case 'set_stock_opening': {
        const stockCode = String(args.stockCode ?? '').trim().toUpperCase();
        if (!/^\d{4,6}[A-Z]?$/.test(stockCode)) throw new Error('股票代碼要是 4-6 位數字，例如 2330');
        const shares = Number(args.shares);
        if (shares === 0) {
          await this.holdings.removeOpening(userId, space.id, stockCode);
          return { removed: stockCode };
        }
        if (!(shares > 0)) throw new Error('股數要大於 0');
        const averageCost = Number(args.averageCost);
        if (args.averageCost == null || !(averageCost >= 0)) throw new Error('要問使用者每股平均成本（均價）');
        return this.holdings.setOpening(userId, space.id, { stockCode, shares, averageCost });
      }
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  private async portfolio(userId: string, spaceId: string) {
    const [holdings, recent] = await Promise.all([
      this.holdings.list(userId, spaceId),
      this.transactions.list(userId, spaceId),
    ]);
    const priced = holdings.filter((h) => h.marketValue != null);
    const totalCost = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    const totalMarketValue = priced.reduce((sum, h) => sum + h.marketValue!, 0);
    const pricedCost = priced.reduce((sum, h) => sum + h.costBasis, 0);
    return {
      holdings: holdings.map((h) => ({
        stockCode: h.stockCode,
        stockName: h.stockName,
        shares: h.shares,
        averageCost: round2(h.averageCost),
        costBasis: Math.round(h.costBasis),
        currentPrice: h.currentPrice,
        marketValue: h.marketValue != null ? Math.round(h.marketValue) : null,
        gainLoss: h.gainLoss != null ? Math.round(h.gainLoss) : null,
        returnPct: h.gainLoss != null ? round2((h.gainLoss / h.costBasis) * 100) : null,
      })),
      totalCost: Math.round(totalCost),
      totalMarketValue: Math.round(totalMarketValue),
      totalGainLoss: Math.round(totalMarketValue - pricedCost),
      totalReturnPct: pricedCost > 0 ? round2(((totalMarketValue - pricedCost) / pricedCost) * 100) : null,
      unpricedStocks: holdings.filter((h) => h.marketValue == null).map((h) => h.stockCode),
      recentTransactions: recent.items.slice(0, RECENT_TRANSACTIONS).map((t) => ({
        date: t.tradeDate.toISOString().slice(0, 10),
        stockCode: t.stockCode,
        type: t.type === 'BUY' ? '買' : '賣',
        shares: t.shares,
        pricePerShare: t.pricePerShare,
        pending: t.pending,
      })),
    };
  }

  private async trend(userId: string, spaceId: string, args: Record<string, unknown>) {
    const stockCode = String(args.stockCode ?? '').trim();
    if (!/^\d{4,6}[A-Z]?$/.test(stockCode)) throw new Error('股票代碼要是 4-6 位數字，例如 2330');
    const months = Math.min(MAX_TREND_MONTHS, Math.max(1, Math.round(Number(args.months) || DEFAULT_TREND_MONTHS)));

    const bars = await this.history.daily(stockCode, months);
    const summary = summarizeTrend(bars);
    if (!summary) throw new Error(`查不到 ${stockCode} 的成交資料（代碼錯誤、或是興櫃/已下市）`);

    const holding = (await this.holdings.list(userId, spaceId)).find((h) => h.stockCode === stockCode);
    return {
      stockCode,
      stockName: holding?.stockName ?? null,
      months,
      ...summary,
      myPosition: holding
        ? {
            shares: holding.shares,
            averageCost: round2(holding.averageCost),
            vsCostPct: round2(((summary.latestClose - holding.averageCost) / holding.averageCost) * 100),
          }
        : null,
    };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
