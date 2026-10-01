import { Injectable, Logger } from '@nestjs/common';

type Row = Record<string, string>;

const DATASET_TTL_MS = 6 * 60 * 60 * 1000;
const NEWS_TTL_MS = 60 * 60 * 1000;
const NEWS_LIMIT = 8;

/** 官方免費開放資料（上市＝證交所 openapi，上櫃＝櫃買中心 openapi），整份抓下來快取。 */
const DATASETS = {
  valuation: ['https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis'],
  revenue: ['https://openapi.twse.com.tw/v1/opendata/t187ap05_L', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O'],
  eps: ['https://openapi.twse.com.tw/v1/opendata/t187ap14_L', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O'],
} as const;

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v.replace(/,/g, '').trim());
  return Number.isFinite(n) && v.trim() !== '' ? n : null;
};
const round = (n: number | null, digits = 2) => (n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits);
/** 千元 → 億元 */
const toYi = (thousands: number | null) => round(thousands == null ? null : thousands / 1e5, 2);

/** 「11508」（民國年月）→「2026-08」 */
export function rocYearMonth(v: string | undefined): string | null {
  const m = v?.match(/^(\d{2,3})(\d{2})$/);
  return m ? `${Number(m[1]) + 1911}-${m[2]}` : null;
}

const code = (r: Row) => r['公司代號'] ?? r.Code ?? r.SecuritiesCompanyCode;

/** Google News RSS → titles. Titles end with「 - 媒體名」. */
export function parseRssItems(xml: string, limit = NEWS_LIMIT): Array<{ title: string; source: string | null; date: string | null }> {
  const decode = (s: string) =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  const items: Array<{ title: string; source: string | null; date: string | null }> = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = decode(body.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    if (!title) continue;
    const source = body.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];
    const pub = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const date = pub ? new Date(pub) : null;
    items.push({
      title: source ? title.replace(new RegExp(`\\s*-\\s*${decode(source).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : title,
      source: source ? decode(source) : null,
      date: date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null,
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** 股票的基本面與新聞（2026-10-01）：本益比/殖利率/淨值比、最新月營收、最新一季 EPS 與獲利、
 * 最近一週新聞標題。給萬用 AI 分析股票時用，不只看價格。 */
@Injectable()
export class StockFundamentalsService {
  private readonly logger = new Logger(StockFundamentalsService.name);
  private readonly datasets = new Map<string, { rows: Row[]; fetchedAt: number }>();
  private readonly news = new Map<string, { items: ReturnType<typeof parseRssItems>; fetchedAt: number }>();

  async get(stockCode: string) {
    const [valuationRow, revenueRow, epsRow] = await Promise.all([
      this.find('valuation', stockCode),
      this.find('revenue', stockCode),
      this.find('eps', stockCode),
    ]);
    const name = valuationRow?.Name ?? valuationRow?.CompanyName ?? revenueRow?.['公司名稱'] ?? null;
    const news = await this.newsFor(stockCode, name);

    return {
      stockCode,
      name,
      valuation: valuationRow
        ? {
            date: valuationRow.Date ?? null,
            peRatio: num(valuationRow.PEratio ?? valuationRow.PriceEarningRatio),
            dividendYieldPct: num(valuationRow.DividendYield ?? valuationRow.YieldRatio),
            pbRatio: num(valuationRow.PBratio ?? valuationRow.PriceBookRatio),
          }
        : null,
      monthlyRevenue: revenueRow
        ? {
            month: rocYearMonth(revenueRow['資料年月']),
            revenueYi: toYi(num(revenueRow['營業收入-當月營收'])),
            momPct: round(num(revenueRow['營業收入-上月比較增減(%)'])),
            yoyPct: round(num(revenueRow['營業收入-去年同月增減(%)'])),
            ytdRevenueYi: toYi(num(revenueRow['累計營業收入-當月累計營收'])),
            ytdYoyPct: round(num(revenueRow['累計營業收入-前期比較增減(%)'])),
            companyNote: revenueRow['備註'] && revenueRow['備註'] !== '-' ? revenueRow['備註'] : null,
          }
        : null,
      latestQuarter: epsRow
        ? {
            period: `${Number(epsRow['年度'] ?? epsRow.Year) + 1911} Q${epsRow['季別']}`,
            eps: num(epsRow['基本每股盈餘(元)'] ?? epsRow['基本每股盈餘']),
            revenueYi: toYi(num(epsRow['營業收入'])),
            operatingIncomeYi: toYi(num(epsRow['營業利益'])),
            netIncomeYi: toYi(num(epsRow['稅後淨利'])),
            note: '累計到該季（年初到該季）的數字，單位億元',
          }
        : null,
      news,
      notes: [
        ...(valuationRow ? [] : ['沒有本益比資料（可能是 ETF、興櫃或代碼錯誤）']),
        ...(revenueRow || epsRow ? [] : ['沒有營收/財報資料（ETF 沒有這些）']),
      ],
    };
  }

  private async find(kind: keyof typeof DATASETS, stockCode: string): Promise<Row | null> {
    for (const url of DATASETS[kind]) {
      const row = (await this.dataset(url)).find((r) => code(r) === stockCode);
      if (row) return row;
    }
    return null;
  }

  private async dataset(url: string): Promise<Row[]> {
    const hit = this.datasets.get(url);
    if (hit && Date.now() - hit.fetchedAt < DATASET_TTL_MS) return hit.rows;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as Row[];
      this.datasets.set(url, { rows, fetchedAt: Date.now() });
      return rows;
    } catch (error) {
      this.logger.warn(`抓 ${url} 失敗：${String(error)}`);
      return hit?.rows ?? [];
    }
  }

  private async newsFor(stockCode: string, name: string | null) {
    const key = stockCode;
    const hit = this.news.get(key);
    if (hit && Date.now() - hit.fetchedAt < NEWS_TTL_MS) return hit.items;
    const q = encodeURIComponent(`${stockCode} ${name ?? ''} when:7d`.replace(/\s+/g, ' ').trim());
    try {
      const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseRssItems(await res.text());
      this.news.set(key, { items, fetchedAt: Date.now() });
      return items;
    } catch (error) {
      this.logger.warn(`抓 ${stockCode} 新聞失敗：${String(error)}`);
      return hit?.items ?? [];
    }
  }
}
