import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { FinanceTransactionsService } from './finance-transactions.service';
import { amountDue, daysBetween, REMIND_DAYS_BEFORE, statementDateFor, upcomingDueDate } from './credit-card';
import { FinanceAccountType, FinanceTransactionType, type FinanceAccount } from '../../generated/prisma/client.js';

export interface CardBill {
  accountId: string;
  name: string;
  statementDate: string;
  dueDate: string;
  daysLeft: number;
  amount: number;
  /** 結帳日還沒到，金額是用目前的欠款估的。 */
  estimated: boolean;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  autoPay: boolean;
}

const CREDIT_TYPES = [FinanceTransactionType.INCOME, FinanceTransactionType.LOAN_IN, FinanceTransactionType.ADVANCE_IN];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** 信用卡繳款（2026-10-01）：算這期要繳多少、繳款日前 3 天和當天 LINE 提醒、
 * 有設自動扣繳就在繳款日自動記一筆轉帳。 */
@Injectable()
export class CreditCardService {
  private readonly logger = new Logger(CreditCardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
    private readonly transactions: FinanceTransactionsService,
  ) {}

  /** 這個空間每張設好結帳日/繳款日的卡，下一期要繳多少。 */
  async bills(spaceId: string, today = taipeiDateKey(new Date())): Promise<CardBill[]> {
    const accounts = await this.prisma.financeAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: 'asc' } });
    const cards = accounts.filter(
      (a) => a.type === FinanceAccountType.CREDIT_CARD && a.statementDay != null && a.paymentDueDay != null,
    );
    return Promise.all(cards.map((card) => this.bill(card, accounts, today)));
  }

  private async bill(card: FinanceAccount, accounts: FinanceAccount[], today: string): Promise<CardBill> {
    const dueDate = upcomingDueDate(today, card.paymentDueDay!);
    const statementDate = statementDateFor(dueDate, card.statementDay!);
    const estimated = statementDate > today;
    // 結帳日還沒到：用到今天為止的欠款估。
    const cutoff = estimated ? today : statementDate;
    const balance = await this.balanceUpTo(card, cutoff);
    const paid = estimated ? 0 : await this.creditsAfter(card, statementDate);
    const payFrom = accounts.find((a) => a.id === card.paymentAccountId) ?? null;
    return {
      accountId: card.id,
      name: card.name,
      statementDate,
      dueDate,
      daysLeft: daysBetween(today, dueDate),
      amount: amountDue(balance, paid),
      estimated,
      paymentAccountId: payFrom?.id ?? null,
      paymentAccountName: payFrom?.name ?? null,
      autoPay: card.cardAutoPay,
    };
  }

  /** 卡片餘額（含 cutoff 當天）：期初＋入帳－出帳＋轉入。 */
  private async balanceUpTo(card: FinanceAccount, cutoff: string): Promise<number> {
    const lte = taipeiDateKeyToUtcMidnight(cutoff);
    const [bySource, transfersIn] = await Promise.all([
      this.prisma.financeTransaction.groupBy({
        by: ['type'],
        where: { accountId: card.id, date: { lte } },
        _sum: { amount: true },
      }),
      this.prisma.financeTransaction.aggregate({
        where: { toAccountId: card.id, type: FinanceTransactionType.TRANSFER, date: { lte } },
        _sum: { amount: true },
      }),
    ]);
    let balance = card.initialBalance + (transfersIn._sum.amount ?? 0);
    for (const row of bySource) {
      const sum = row._sum.amount ?? 0;
      balance += (CREDIT_TYPES as FinanceTransactionType[]).includes(row.type) ? sum : -sum;
    }
    return balance;
  }

  /** 結帳日之後繳進卡片的錢（轉帳進來、退款等入帳）。 */
  private async creditsAfter(card: FinanceAccount, statementDate: string): Promise<number> {
    const gt = taipeiDateKeyToUtcMidnight(statementDate);
    const [transfersIn, credits] = await Promise.all([
      this.prisma.financeTransaction.aggregate({
        where: { toAccountId: card.id, type: FinanceTransactionType.TRANSFER, date: { gt } },
        _sum: { amount: true },
      }),
      this.prisma.financeTransaction.aggregate({
        where: { accountId: card.id, type: { in: CREDIT_TYPES }, date: { gt } },
        _sum: { amount: true },
      }),
    ]);
    return (transfersIn._sum.amount ?? 0) + (credits._sum.amount ?? 0);
  }

  /** 記一筆繳卡費：從扣款帳戶轉到卡片。 */
  async pay(userId: string, spaceId: string, cardId: string, fromAccountId: string, amount: number, date: string) {
    return this.transactions.create(userId, spaceId, {
      type: FinanceTransactionType.TRANSFER,
      amount,
      accountId: fromAccountId,
      toAccountId: cardId,
      date,
      note: '繳信用卡費',
    });
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async remindDueBills(): Promise<void> {
    const today = taipeiDateKey(new Date());
    const cards = await this.prisma.financeAccount.findMany({
      where: { type: FinanceAccountType.CREDIT_CARD, statementDay: { not: null }, paymentDueDay: { not: null } },
      include: { space: { select: { ownerUserId: true } } },
    });
    for (const card of cards) {
      try {
        await this.remindOne(card, card.space.ownerUserId, today);
      } catch (error) {
        this.logger.error(`信用卡繳款提醒失敗（${card.name}）`, error);
      }
    }
  }

  private async remindOne(card: FinanceAccount, ownerUserId: string | null, today: string) {
    if (!ownerUserId) return;
    const accounts = await this.prisma.financeAccount.findMany({ where: { spaceId: card.spaceId } });
    const bill = await this.bill(card, accounts, today);
    if (bill.amount <= 0 || !REMIND_DAYS_BEFORE.includes(bill.daysLeft)) return;

    const key = `${bill.dueDate}:${bill.daysLeft}`;
    if (card.cardReminderKey === key) return;
    await this.prisma.financeAccount.update({ where: { id: card.id }, data: { cardReminderKey: key } });

    const due = `${Number(bill.dueDate.slice(5, 7))}/${Number(bill.dueDate.slice(8))}`;
    if (bill.daysLeft === 0 && bill.autoPay && bill.paymentAccountId) {
      await this.pay(ownerUserId, card.spaceId, card.id, bill.paymentAccountId, bill.amount, today);
      await this.notifier.notifyBySpace(
        card.spaceId,
        `💳「${card.name}」今天自動扣繳 ${fmt(bill.amount)} 元，已幫你記一筆從「${bill.paymentAccountName}」轉過去。\n金額不對的話跟我說「卡費改成 X 元」。`,
      );
      return;
    }
    const when = bill.daysLeft === 0 ? '今天' : `${bill.daysLeft} 天後（${due}）`;
    await this.notifier.notifyBySpace(
      card.spaceId,
      [
        `💳「${card.name}」${when}要繳卡費 ${fmt(bill.amount)} 元`,
        bill.paymentAccountName ? `扣款帳戶：${bill.paymentAccountName}` : null,
        bill.autoPay ? '有設自動扣繳，繳款日會自動幫你記帳。' : '繳完跟我說「卡費繳好了」，我幫你記一筆轉帳。',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    );
  }
}
