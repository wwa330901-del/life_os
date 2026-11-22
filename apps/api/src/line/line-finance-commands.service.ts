import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { FinanceAccountType, FinanceCategoryKind, FinanceTransactionType } from '../../generated/prisma/client.js';
import { taipeiTodayRange, taipeiCurrentMonth } from '../common/taipei-date';
import { LineReplyService } from './line-reply.service';
import { Responder, LEADING_SEPARATORS, EDGE_SEPARATORS } from './line-shared';

/** LINE 記帳：記帳說明、支出／收入、轉帳、財務總覽。 */
@Injectable()
export class LineFinanceCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccountsService: FinanceAccountsService,
    private readonly financeTransactionsService: FinanceTransactionsService,
    private readonly financeBudgetsService: FinanceBudgetsService,
    private readonly out: LineReplyService,
  ) {}

  async sendFinanceHelp(userId: string, replyToken: string) {
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
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.financeAccount.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const expenseCats = this.formatCategoryOptions(
      categories,
      FinanceCategoryKind.EXPENSE,
    );
    const incomeCats = this.formatCategoryOptions(
      categories,
      FinanceCategoryKind.INCOME,
    );

    const accountList = accounts.length ? accounts.map((a) => a.name).join('、') : '（還沒有，請到 App 新增）';
    await this.out.reply(
      replyToken,
      [
        '💰 記帳',
        '支出300午餐現金',
        '',
        `支出分類　${expenseCats}`,
        `收入分類　${incomeCats}`,
        `帳戶　　　${accountList}`,
        '（帳戶名稱要打對，打錯會報錯）',
        '',
        '💱 轉帳',
        '轉帳 現金 1000 玉山銀行',
      ].join('\n'),
    );
  }

  /** Categories that can actually be recorded against directly — a 母分類
   * with children can't (the child is the real classification), so it's
   * excluded; everything else (a childless top-level category, or a
   * 子分類 itself) is a leaf. */
  leafCategories<T extends { id: string; parentId: string | null }>(
    categories: T[],
  ): T[] {
    const parentIds = new Set(
      categories.filter((c) => c.parentId).map((c) => c.parentId!),
    );
    return categories.filter((c) => !parentIds.has(c.id));
  }

  /** "分類、母分類（子1、子2）、..." — every 母分類 shows its 子分類 in
   * parentheses right after it so the LINE reply reflects the same
   * hierarchy as the app, instead of a flat list of leaf names that hides
   * which children belong under which parent. */
  formatCategoryOptions(
    categories: {
      id: string;
      name: string;
      kind: FinanceCategoryKind;
      parentId: string | null;
    }[],
    kind: FinanceCategoryKind,
  ): string {
    const ofKind = categories.filter((c) => c.kind === kind);
    const topLevel = ofKind.filter((c) => !c.parentId);
    const parts = topLevel.map((c) => {
      const children = ofKind
        .filter((child) => child.parentId === c.id)
        .map((child) => child.name);
      return children.length ? `${c.name}（${children.join('、')}）` : c.name;
    });
    return parts.length ? parts.join('、') : '（還沒有，請到 App 新增）';
  }

  /** Returns true once it's decided this text *was* a 記帳 command attempt
   * (even if parsing failed, in which case it already sent an error reply)
   * — false only means "not a 記帳 command at all", so the caller can keep
   * trying other interpretations. */
  /** `aiAvailable`: when the fixed format can't be parsed (or 帳戶 is
   * missing), return false so the message falls through to the LINE AI,
   * which can work it out or ask — instead of a format error. */
  async tryFinanceCommand(
    userId: string,
    text: string,
    respond: Responder,
    aiAvailable = false,
  ): Promise<boolean> {
    if (!text.startsWith('支出') && !text.startsWith('收入')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }
    const [categories, accounts] = await Promise.all([
      this.prisma.financeCategory.findMany({ where: { spaceId: space.id } }),
      this.prisma.financeAccount.findMany({
        where: { spaceId: space.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const parsed = this.parseFinanceCommand(
      text,
      this.leafCategories(categories),
      accounts,
    );
    if (!parsed) {
      if (aiAvailable) return false;
      await respond('看不懂記帳格式，傳「記帳」看範例跟目前可用的分類/帳戶。');
      return true;
    }

    if (accounts.length === 0) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }
    if (!parsed.accountId) {
      // 沒講帳戶：交給 AI 猜最常用的帳戶再跟使用者確認（2026-09-30）。
      if (aiAvailable) return false;
      await respond(
        `帳戶錯誤，請在指令裡包含正確的帳戶名稱：${accounts.map((a) => a.name).join('、')}`,
      );
      return true;
    }
    const accountId = parsed.accountId;

    const transactionDate = new Date();
    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: parsed.type,
        amount: parsed.amount,
        accountId,
        categoryId: parsed.categoryId,
        date: transactionDate,
        note: parsed.note,
      },
    });
    if (parsed.type === FinanceTransactionType.EXPENSE && parsed.categoryId) {
      await this.financeBudgetsService.notifyIfOverspent(
        space.id,
        parsed.categoryId,
        transactionDate,
      );
    }

    const account = accounts.find((a) => a.id === accountId);
    const category = parsed.categoryId
      ? categories.find((c) => c.id === parsed.categoryId)
      : null;
    const typeLabel =
      parsed.type === FinanceTransactionType.INCOME ? '收入' : '支出';
    await respond(
      `已記錄${typeLabel} ${parsed.amount.toLocaleString('en-US')}（${category?.name ?? '未分類'} · ${account?.name ?? ''}）${parsed.note ? ' · ' + parsed.note : ''}`,
    );
    return true;
  }

  /** "支出/收入 金額 分類 帳戶 備註" — every gap may be any mix of
   * whitespace/punctuation or nothing at all. Amount is extracted as the
   * digit run right after the type keyword; 分類/帳戶 are found by
   * scanning the space's own category/account names as substrings
   * (longest name first, so e.g. a category "早餐" wins over a shorter
   * unrelated "餐" if both existed) rather than by position — this is what
   * makes zero-separator input parseable at all, and incidentally is also
   * what fixes the older one-line command's "分類會變成備註" complaint
   * without needing a multi-step flow. Whatever's left becomes the note.
   * 帳戶 is required (2026-08-06) — `accountId` staying null here (no
   * substring in the message matched any of the caller's real accounts)
   * makes `tryFinanceCommand` reply with an error instead of silently
   * filing the transaction under the first account; there's no way to
   * tell "帳戶沒打" apart from "帳戶打錯字" with substring matching, so
   * both are now treated the same — say the right name. */
  parseFinanceCommand(
    text: string,
    categories: { id: string; name: string; kind: FinanceCategoryKind }[],
    accounts: { id: string; name: string }[],
  ): {
    type: FinanceTransactionType;
    amount: number;
    categoryId: string | null;
    accountId: string | null;
    note: string | null;
  } | null {
    let rest = text.trim();
    let type: FinanceTransactionType;
    if (rest.startsWith('支出')) {
      type = FinanceTransactionType.EXPENSE;
      rest = rest.slice(2);
    } else if (rest.startsWith('收入')) {
      type = FinanceTransactionType.INCOME;
      rest = rest.slice(2);
    } else {
      return null;
    }
    rest = rest.replace(LEADING_SEPARATORS, '');

    const amountMatch = rest.match(/^\d+(\.\d+)?/);
    if (!amountMatch) return null;
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    rest = rest.slice(amountMatch[0].length).replace(LEADING_SEPARATORS, '');

    const kind =
      type === FinanceTransactionType.INCOME
        ? FinanceCategoryKind.INCOME
        : FinanceCategoryKind.EXPENSE;
    let categoryId: string | null = null;
    for (const c of categories
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.name.length - a.name.length)) {
      const idx = rest.indexOf(c.name);
      if (idx !== -1) {
        categoryId = c.id;
        rest = rest.slice(0, idx) + rest.slice(idx + c.name.length);
        break;
      }
    }

    let accountId: string | null = null;
    for (const a of [...accounts].sort(
      (x, y) => y.name.length - x.name.length,
    )) {
      const idx = rest.indexOf(a.name);
      if (idx !== -1) {
        accountId = a.id;
        rest = rest.slice(0, idx) + rest.slice(idx + a.name.length);
        break;
      }
    }

    const note = rest.replace(EDGE_SEPARATORS, '').trim() || null;
    return { type, amount, categoryId, accountId, note };
  }

  // --- 轉帳（自己帳戶間）---

  /** "轉帳 轉出帳戶 金額 轉入帳戶 備註" (2026-08-06) — unlike 記帳's single
   * account, this needs to identify TWO, so it can't just scan the whole
   * remaining text for any account-name substring the way 記帳/股票買賣 do
   * (no way to tell which occurrence is which). Splits on the amount
   * instead — text before it is the 轉出帳戶 zone, text after is
   * 轉入帳戶+備註 — and matches each zone independently. Both accounts are
   * required (same "帳戶必填" reasoning as 記帳/股票買賣); actual business
   * rules (can't transfer to the same account, etc.) are `
   * FinanceTransactionsService.validate`'s job, not re-implemented here. */
  async tryTransferCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('轉帳')) return false;

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
    if (accounts.length < 2) {
      await respond('轉帳需要至少兩個記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增。');
      return true;
    }

    const parsed = this.parseTransferCommand(text, accounts);
    if (!parsed) {
      await respond(
        `看不懂轉帳格式，請用「轉帳 轉出帳戶 金額 轉入帳戶 備註」這種格式，例如「轉帳 現金 1000 玉山銀行」。目前帳戶：${accounts.map((a) => a.name).join('、')}`,
      );
      return true;
    }

    try {
      await this.financeTransactionsService.create(userId, space.id, {
        type: FinanceTransactionType.TRANSFER,
        amount: parsed.amount,
        accountId: parsed.fromAccountId,
        toAccountId: parsed.toAccountId,
        date: new Date().toISOString(),
        note: parsed.note ?? undefined,
      });
      const from = accounts.find((a) => a.id === parsed.fromAccountId);
      const to = accounts.find((a) => a.id === parsed.toAccountId);
      await respond(
        `已記錄轉帳 ${parsed.amount.toLocaleString('en-US')}（${from?.name ?? ''} → ${to?.name ?? ''}）${parsed.note ? ' · ' + parsed.note : ''}`,
      );
    } catch (error) {
      await respond(error instanceof Error ? error.message : '轉帳記錄失敗了，稍後再試一次。');
    }
    return true;
  }

  parseTransferCommand(
    text: string,
    accounts: { id: string; name: string }[],
  ): { fromAccountId: string; amount: number; toAccountId: string; note: string | null } | null {
    const rest = text.slice(2).replace(LEADING_SEPARATORS, '');

    const amountMatch = rest.match(/\d+(\.\d+)?/);
    if (!amountMatch || amountMatch.index === undefined) return null;
    const before = rest.slice(0, amountMatch.index);
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    const after = rest
      .slice(amountMatch.index + amountMatch[0].length)
      .replace(LEADING_SEPARATORS, '');

    const fromAccountId = this.matchAccountName(before, accounts);
    if (!fromAccountId) return null;

    const sortedByLength = [...accounts].sort((x, y) => y.name.length - x.name.length);
    let toAccountId: string | null = null;
    let toName = '';
    for (const a of sortedByLength) {
      const idx = after.indexOf(a.name);
      if (idx !== -1) {
        toAccountId = a.id;
        toName = a.name;
        break;
      }
    }
    if (!toAccountId) return null;

    const toIdx = after.indexOf(toName);
    const note =
      (after.slice(0, toIdx) + after.slice(toIdx + toName.length))
        .replace(EDGE_SEPARATORS, '')
        .trim() || null;

    return { fromAccountId, amount, toAccountId, note };
  }

  /** Longest-name-first substring match, same technique 記帳/股票買賣 use
   * for a single account — factored out here since 轉帳 needs it twice
   * (once per zone) rather than duplicating the loop a third time. */
  matchAccountName(text: string, accounts: { id: string; name: string }[]): string | null {
    for (const a of [...accounts].sort((x, y) => y.name.length - x.name.length)) {
      if (text.indexOf(a.name) !== -1) return a.id;
    }
    return null;
  }

  // --- 借貸（跟人借錢/借錢給人）---

  /** 個人財務總覽：every account's current balance, today's and this
   * month's income/expense totals, and this month's expense breakdown by
   * category — everything reused from the same services the app's own
   * finance screens call, just formatted as one text reply. */
  async sendOverview(userId: string, replyToken: string) {
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

    const month = taipeiCurrentMonth();
    const { start: todayStart, end: todayEnd } = taipeiTodayRange();

    const [accounts, monthSummary, todayTransactions] = await Promise.all([
      this.financeAccountsService.list(userId, space.id),
      this.financeTransactionsService.monthlySummary(userId, space.id, month),
      this.prisma.financeTransaction.findMany({
        where: {
          spaceId: space.id,
          date: { gte: todayStart, lt: todayEnd },
          type: {
            in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE],
          },
        },
      }),
    ]);

    const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
    const todayIncome = todayTransactions
      .filter((t) => t.type === FinanceTransactionType.INCOME)
      .reduce((sum, t) => sum + t.amount, 0);
    const todayExpense = todayTransactions
      .filter((t) => t.type === FinanceTransactionType.EXPENSE)
      .reduce((sum, t) => sum + t.amount, 0);

    const lines: string[] = ['📊 財務總覽', ''];

    lines.push('帳戶餘額：');
    if (accounts.length === 0) {
      lines.push('（還沒有任何帳戶）');
    } else {
      for (const a of accounts) {
        const isDebt =
          a.type === FinanceAccountType.CREDIT_CARD && a.balance < 0;
        lines.push(
          `・${a.name}：${isDebt ? `欠款 ${fmt(-a.balance)}` : fmt(a.balance)}`,
        );
      }
    }

    lines.push(
      '',
      `今日：收入 ${fmt(todayIncome)} · 支出 ${fmt(todayExpense)}`,
    );
    lines.push(
      `本月：收入 ${fmt(monthSummary.totalIncome)} · 支出 ${fmt(monthSummary.totalExpense)}`,
    );

    const expenseCategories = monthSummary.byCategory
      .filter((c) => c.kind === FinanceTransactionType.EXPENSE)
      .sort((a, b) => b.total - a.total);
    if (expenseCategories.length > 0) {
      lines.push('', '本月支出分類佔比：');
      for (const c of expenseCategories) {
        const pct =
          monthSummary.totalExpense > 0
            ? Math.round((c.total / monthSummary.totalExpense) * 100)
            : 0;
        lines.push(`・${c.name} ${pct}%（${fmt(c.total)}）`);
      }
    }

    await this.out.reply(replyToken, lines.join('\n'));
  }

  // --- 股票投資 ---
}
