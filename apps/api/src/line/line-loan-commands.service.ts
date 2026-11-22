import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceLoansService } from '../finance/finance-loans.service';
import { FinanceAdvancesService } from '../finance/finance-advances.service';
import { FinanceLoanDirection } from '../../generated/prisma/client.js';
import { LineReplyService } from './line-reply.service';
import { Responder, LEADING_SEPARATORS } from './line-shared';

/** LINE 借貸和代墊：借出／借入、還款、代墊、收回。 */
@Injectable()
export class LineLoanCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeLoansService: FinanceLoansService,
    private readonly financeAdvancesService: FinanceAdvancesService,
    private readonly out: LineReplyService,
  ) {}

  /** "借出/借入 金額 給/跟對象 [備註]" — always uses the caller's first
   * finance account, since there's no room in this compact command to also
   * name an account (deliberate — unlike 記帳/股票買賣/轉帳, this format
   * never asks for one, so there's nothing to fail to recognize). */
  async tryLoanCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('借出') && !text.startsWith('借入')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }

    const parsed = this.parseLoanCommand(text);
    if (!parsed) {
      await respond(
        '看不懂借貸格式，請用「借出 3000 給小明」或「借入 5000 跟小華」這種格式。',
      );
      return true;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }

    await this.financeLoansService.create(userId, space.id, {
      direction: parsed.direction,
      counterpartyName: parsed.counterpartyName,
      amount: parsed.amount,
      accountId,
      date: new Date().toISOString(),
      note: parsed.note ?? undefined,
    });

    const label =
      parsed.direction === FinanceLoanDirection.LEND
        ? `借出 ${parsed.amount.toLocaleString('en-US')} 給${parsed.counterpartyName}`
        : `借入 ${parsed.amount.toLocaleString('en-US')}（跟${parsed.counterpartyName}）`;
    await respond(`已記錄${label}，傳「借貸列表」查看。`);
    return true;
  }

  /** "給"/"跟" marks where the counterparty name starts — whichever comes
   * first, regardless of direction (lenient, matches this file's general
   * parsing philosophy). Name runs up to the first whitespace/punctuation;
   * anything after that becomes an optional note. */
  parseLoanCommand(text: string): {
    direction: FinanceLoanDirection;
    amount: number;
    counterpartyName: string;
    note: string | null;
  } | null {
    let rest = text.trim();
    let direction: FinanceLoanDirection;
    if (rest.startsWith('借出')) {
      direction = FinanceLoanDirection.LEND;
      rest = rest.slice(2);
    } else if (rest.startsWith('借入')) {
      direction = FinanceLoanDirection.BORROW;
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

    const giveIdx = rest.indexOf('給');
    const withIdx = rest.indexOf('跟');
    const idx =
      giveIdx === -1 ? withIdx : withIdx === -1 ? giveIdx : Math.min(giveIdx, withIdx);
    if (idx === -1) return null;
    rest = rest.slice(idx + 1);

    const nameMatch = rest.match(/^[^\s，,。.]+/);
    if (!nameMatch) return null;
    const counterpartyName = nameMatch[0];
    const note =
      rest.slice(nameMatch[0].length).replace(LEADING_SEPARATORS, '').trim() || null;
    return { direction, amount, counterpartyName, note };
  }

  /** "借貸列表" — lists only unsettled loans (settled ones would just pile
   * up forever otherwise), numbered so "還款 N 金額" can reference one.
   * Overwrites `lastLoanListIds` every time, same pattern as
   * `lastTodoListIds`. */
  async sendLoanList(linkId: string, userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.out.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const { items: outstanding } = await this.financeLoansService.list(userId, space.id, {
      settled: false,
    });

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastLoanListIds: outstanding.map((l) => l.id) },
    });

    if (outstanding.length === 0) {
      await this.out.reply(replyToken, '💰 借貸列表\n\n目前沒有未結清的借貸。');
      return;
    }

    const lines = ['💰 借貸列表（未結清）', ''];
    outstanding.forEach((loan, i) => {
      const label =
        loan.direction === FinanceLoanDirection.LEND
          ? `借給${loan.counterpartyName}`
          : `跟${loan.counterpartyName}借`;
      const principal = loan.initialTransaction?.amount ?? 0;
      lines.push(
        `${i + 1}. ${label}　還剩 ${loan.outstanding.toLocaleString('en-US')}（原 ${principal.toLocaleString('en-US')}）`,
      );
    });
    lines.push('', '傳「還款 編號 金額」登記還款，例如「還款 1 1000」。');
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** "還款 編號 金額" — references `lastLoanListIds` from the most recent
   * "借貸列表". Which direction the cash actually moves (settling a LEND
   * vs. a BORROW) is entirely `FinanceLoansService.addRepayment`'s call —
   * this method doesn't need to know or care. */
  async repayLoanByNumber(linkId: string, text: string, replyToken: string) {
    const match = text.match(/(\d+)\D+(\d+(?:\.\d+)?)/);
    if (!match) {
      await this.out.reply(
        replyToken,
        '請用「還款 編號 金額」，例如「還款 1 1000」，編號請先傳「借貸列表」查看。',
      );
      return;
    }
    const n = Number(match[1]);
    const amount = Number(match[2]);

    const link = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    const loanId = link?.lastLoanListIds[n - 1];
    if (!link || !loanId) {
      await this.out.reply(replyToken, `找不到編號 ${n}，請先傳「借貸列表」看目前的編號。`);
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: link.userId },
    });
    if (!space) {
      await this.out.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await this.out.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    try {
      const updated = await this.financeLoansService.addRepayment(link.userId, space.id, loanId, {
        amount,
        accountId,
        date: new Date().toISOString(),
      });
      await this.out.reply(
        replyToken,
        `已登記還款 ${amount.toLocaleString('en-US')}，${updated.settled ? '這筆借貸已經結清了！' : `還剩 ${updated.outstanding.toLocaleString('en-US')} 未結清。`}`,
      );
    } catch (error) {
      await this.out.reply(
        replyToken,
        error instanceof Error ? error.message : '登記還款失敗了，稍後再試一次。',
      );
    }
  }

  // --- 代墊（工作上先幫忙出錢，之後還你）---

  /** "代墊 金額 說明" */
  async tryAdvanceCommand(
    userId: string,
    text: string,
    respond: Responder,
  ): Promise<boolean> {
    if (!text.startsWith('代墊') || text.startsWith('代墊列表')) return false;

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await respond('找不到你的個人空間，請先到元序 App 登入一次。');
      return true;
    }

    const parsed = this.parseAdvanceCommand(text);
    if (!parsed) {
      await respond('看不懂代墊格式，請用「代墊 5000 材料款」這種格式。');
      return true;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await respond('你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return true;
    }

    await this.financeAdvancesService.create(userId, space.id, {
      title: parsed.title,
      amount: parsed.amount,
      accountId,
      date: new Date().toISOString(),
    });

    await respond(`已記錄代墊 ${parsed.amount.toLocaleString('en-US')}（${parsed.title}），傳「代墊列表」查看。`);
    return true;
  }

  parseAdvanceCommand(text: string): {
    amount: number;
    title: string;
  } | null {
    let rest = text.slice(2).replace(LEADING_SEPARATORS, '');
    const amountMatch = rest.match(/^\d+(\.\d+)?/);
    if (!amountMatch) return null;
    const amount = Number(amountMatch[0]);
    if (!(amount > 0)) return null;
    rest = rest.slice(amountMatch[0].length).replace(LEADING_SEPARATORS, '');

    const title = rest.trim();
    if (!title) return null;
    return { amount, title };
  }

  /** "代墊列表" — same shape as `sendLoanList`, unsettled-only + numbered
   * for "收回代墊 N 金額". */
  async sendAdvanceList(linkId: string, userId: string, replyToken: string) {
    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: userId },
    });
    if (!space) {
      await this.out.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const { items: outstanding } = await this.financeAdvancesService.list(userId, space.id, {
      settled: false,
    });

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastAdvanceListIds: outstanding.map((a) => a.id) },
    });

    if (outstanding.length === 0) {
      await this.out.reply(replyToken, '💸 代墊列表\n\n目前沒有未收回的代墊。');
      return;
    }

    const lines = ['💸 代墊列表（未收回）', ''];
    outstanding.forEach((advance, i) => {
      const principal = advance.initialTransaction?.amount ?? 0;
      lines.push(
        `${i + 1}. ${advance.title}　還剩 ${advance.outstanding.toLocaleString('en-US')}（原 ${principal.toLocaleString('en-US')}）`,
      );
    });
    lines.push('', '傳「收回代墊 編號 金額」登記收回，例如「收回代墊 1 1000」。');
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** "收回代墊 編號 金額" — references `lastAdvanceListIds`. */
  async repayAdvanceByNumber(linkId: string, text: string, replyToken: string) {
    const match = text.match(/(\d+)\D+(\d+(?:\.\d+)?)/);
    if (!match) {
      await this.out.reply(
        replyToken,
        '請用「收回代墊 編號 金額」，例如「收回代墊 1 1000」，編號請先傳「代墊列表」查看。',
      );
      return;
    }
    const n = Number(match[1]);
    const amount = Number(match[2]);

    const link = await this.prisma.lineAccountLink.findUnique({ where: { id: linkId } });
    const advanceId = link?.lastAdvanceListIds[n - 1];
    if (!link || !advanceId) {
      await this.out.reply(replyToken, `找不到編號 ${n}，請先傳「代墊列表」看目前的編號。`);
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { ownerUserId: link.userId },
    });
    if (!space) {
      await this.out.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }
    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    const accountId = accounts[0]?.id;
    if (!accountId) {
      await this.out.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    try {
      const updated = await this.financeAdvancesService.addRepayment(
        link.userId,
        space.id,
        advanceId,
        { amount, accountId, date: new Date().toISOString() },
      );
      await this.out.reply(
        replyToken,
        `已登記收回 ${amount.toLocaleString('en-US')}，${updated.settled ? '這筆代墊已經全部收回了！' : `還剩 ${updated.outstanding.toLocaleString('en-US')} 未收回。`}`,
      );
    } catch (error) {
      await this.out.reply(
        replyToken,
        error instanceof Error ? error.message : '登記收回失敗了，稍後再試一次。',
      );
    }
  }
}
