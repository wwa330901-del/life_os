import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksHoldingsService } from '../stocks/stocks-holdings.service';
import { StocksRecurringService } from '../stocks/stocks-recurring.service';
import { computeSettlementDate } from '../stocks/stock-settlement-schedule';
import { StockTransactionType } from '../../generated/prisma/client.js';
import { LineReplyService } from './line-reply.service';
import { Responder, LEADING_SEPARATORS } from './line-shared';

/** LINE 股票：買股／賣股、持股、定期定額成交回報。 */
@Injectable()
export class LineStockCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stocksHoldingsService: StocksHoldingsService,
    private readonly stocksRecurringService: StocksRecurringService,
    private readonly out: LineReplyService,
  ) {}

  async sendStockHelp(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.out.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const stockAccount = accounts.find((a) => a.id === space.stockAccountId);
    await this.out.reply(
      replyToken,
      [
        '📈 股票買賣',
        stockAccount ? '買股0050 152 20' : '買股0050 152 20 國泰世華',
        stockAccount
          ? `（代碼／成交價／股數，金額自動算；帳戶不用打，固定用「${stockAccount.name}」）`
          : '（代碼／成交價／股數／帳戶，金額自動算）',
        '賣出用「賣股」開頭',
        '',
        `帳戶　${accounts.length ? accounts.map((a) => a.name).join('、') : '（還沒有，請到 App 新增）'}`,
        ...(stockAccount ? [] : ['（到 App 股票頁設定「股票帳戶」之後就不用每次打帳戶）']),
        '',
        '交割日（T+2）自動記帳｜傳「持股總覽」看損益',
      ].join('\n'),
    );
  }

  async sendStockHoldings(userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.out.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return;
    }
    const holdings = await this.stocksHoldingsService.list(userId, space.id);
    if (holdings.length === 0) {
      await this.out.reply(replyToken, '📊 持股總覽\n\n（目前沒有任何持股）');
      return;
    }
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    const lines = ['📊 持股總覽', ''];
    for (const h of holdings) {
      const priceLabel =
        h.currentPrice != null ? fmt(h.currentPrice) : '（無報價）';
      const gainLossLabel =
        h.gainLoss != null
          ? `${h.gainLoss >= 0 ? '+' : ''}${fmt(h.gainLoss)}`
          : '（無報價）';
      lines.push(
        `・${h.stockName ?? h.stockCode}（${h.stockCode}）：${h.shares.toFixed(2)}股 · 均價 ${fmt(h.averageCost)} · 現價 ${priceLabel} · 損益 ${gainLossLabel}`,
      );
    }
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** Returns true once it's decided this text *was* a 股票買賣 command
   * attempt (even if parsing failed) — same "true means stop trying other
   * interpretations" contract as `tryFinanceCommand`. Writes go straight
   * through Prisma for the same LINE-trust-boundary reason 記帳 does. */
  async tryStockCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('買股') && !text.startsWith('賣股')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const parsed = this.parseStockCommand(text, accounts);
    if (!parsed) {
      await respond('看不懂股票交易格式，傳「股票買賣」看範例跟目前可用的帳戶。');
      return true;
    }

    if (accounts.length === 0) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }
    // 沒打帳戶 → 用設定的股票帳戶。
    const accountId = parsed.accountId ?? accounts.find((a) => a.id === space.stockAccountId)?.id;
    if (!accountId) {
      await respond(
        `帳戶錯誤，請在指令裡包含正確的帳戶名稱：${accounts.map((a) => a.name).join('、')}（或到 App 股票頁設定「股票帳戶」就不用打）`,
      );
      return true;
    }

    const tradeDate = new Date();
    const totalCost = parsed.shares * parsed.pricePerShare;
    await this.prisma.stockTransaction.create({
      data: {
        spaceId: space.id,
        stockCode: parsed.stockCode,
        type: parsed.type,
        pricePerShare: parsed.pricePerShare,
        totalCost,
        shares: parsed.shares,
        tradeDate,
        settlementDate: computeSettlementDate(tradeDate),
        accountId,
      },
    });

    const account = accounts.find((a) => a.id === accountId);
    const typeLabel =
      parsed.type === StockTransactionType.BUY ? '買入' : '賣出';
    await respond(
      `已記錄${typeLabel} ${parsed.stockCode} ${parsed.shares} 股（成交價 ${parsed.pricePerShare}，金額 ${Math.round(totalCost).toLocaleString('en-US')}，帳戶 ${account?.name ?? ''}），交割日（T+2）到了會自動記帳。`,
    );
    return true;
  }

  /** "買股/賣股 代碼 成交價 股數 帳戶" — same lenient any/no-separator
   * parsing as `parseFinanceCommand`. 金額 is never typed, only derived
   * (pricePerShare * shares) — 2026-08-12：這之前是反過來（打投入成本、
   * 股數用算的），但券商的成交回報一向是告訴你成交價／股數，不是要你自己
   * 反推的總額，改成股數優先更貼近實際操作。Stock code is taken as a
   * leading 4-6 digit run (covers ordinary 4-digit tickers and 5-6 digit
   * ETF codes like 00929); 帳戶 is found the same substring-scan way
   * accounts are in 記帳, and is required the same way too (2026-08-06) —
   * `tryStockCommand` errors instead of defaulting when nothing matched. */
  parseStockCommand(
    text: string,
    accounts: { id: string; name: string }[],
  ): {
    type: StockTransactionType;
    stockCode: string;
    pricePerShare: number;
    shares: number;
    accountId: string | null;
  } | null {
    let rest = text.trim();
    let type: StockTransactionType;
    if (rest.startsWith('買股')) {
      type = StockTransactionType.BUY;
      rest = rest.slice(2);
    } else if (rest.startsWith('賣股')) {
      type = StockTransactionType.SELL;
      rest = rest.slice(2);
    } else {
      return null;
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const codeMatch = rest.match(/^\d{4,6}/);
    if (!codeMatch) return null;
    const stockCode = codeMatch[0];
    rest = rest.slice(codeMatch[0].length).replace(LEADING_SEPARATORS, '');

    const priceMatch = rest.match(/^\d+(\.\d+)?/);
    if (!priceMatch) return null;
    const pricePerShare = Number(priceMatch[0]);
    if (!(pricePerShare > 0)) return null;
    rest = rest.slice(priceMatch[0].length).replace(LEADING_SEPARATORS, '');

    const sharesMatch = rest.match(/^\d+(\.\d+)?/);
    if (!sharesMatch) return null;
    const shares = Number(sharesMatch[0]);
    if (!(shares > 0)) return null;
    rest = rest.slice(sharesMatch[0].length).replace(LEADING_SEPARATORS, '');

    let accountId: string | null = null;
    for (const a of [...accounts].sort(
      (x, y) => y.name.length - x.name.length,
    )) {
      const idx = rest.indexOf(a.name);
      if (idx !== -1) {
        accountId = a.id;
        break;
      }
    }

    return { type, stockCode, pricePerShare, shares, accountId };
  }

  /** A bare "代碼 成交價" with no keyword prefix (e.g. "0050 600") is only
   * ever a reply to a fired 定期定額 提醒 — matched against
   * `StockRecurringInvestment.awaitingReply` by
   * `StocksRecurringService.fulfillPendingReply`, never by position. 股數/
   * 金額不用打，計畫自己的 monthlyAmount 早就設定好了，回覆只需要成交價
   * 本身。The whole text must match exactly two groups (anchored), so this
   * never fires on unrelated messages that merely start with digits — and
   * specifically never collides with the old 3-number format some other
   * command might send, since that's a different length. */
  async tryStockDcaReply(
    userId: string,
    text: string,
    replyToken: string,
  ): Promise<boolean> {
    const match = text.match(/^(\d{4,6})[\s\-+*/,，、]*(\d+(?:\.\d+)?)$/);
    if (!match) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.out.reply(
        replyToken,
        '找不到你的個人空間，請先到元序 App 登入一次。',
      );
      return true;
    }

    const stockCode = match[1];
    const pricePerShare = Number(match[2]);
    try {
      const result = await this.stocksRecurringService.fulfillPendingReply(
        space.id,
        stockCode,
        pricePerShare,
      );
      if (!result) {
        await this.out.reply(
          replyToken,
          `目前沒有「${stockCode}」在等待定期定額回覆，請確認代碼是否正確，或這筆是不是已經記過了。`,
        );
        return true;
      }
      await this.out.reply(
        replyToken,
        `已記錄定期定額：${stockCode} 成交價 ${pricePerShare}，買進 ${result.shares} 股（花費 ${Math.round(result.totalCost).toLocaleString('en-US')}），已立即從帳戶扣款。`,
      );
    } catch (error) {
      await this.out.reply(replyToken, error instanceof Error ? error.message : '定期定額登記失敗了，稍後再試一次。');
    }
    return true;
  }

  // --- 知識庫 ---
}
