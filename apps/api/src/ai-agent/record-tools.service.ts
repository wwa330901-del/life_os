import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceLoansService } from '../finance/finance-loans.service';
import { FinanceAdvancesService } from '../finance/finance-advances.service';
import { FinanceTransactionsService } from '../finance/finance-transactions.service';
import { TodosService } from '../todos/todos.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { StocksTransactionsService } from '../stocks/stocks-transactions.service';
import { CreditCardService } from '../finance/credit-card.service';
import { FinanceAccountsService } from '../finance/finance-accounts.service';
import { taipeiDateKey, taipeiWallClockToUtc, utcDateKey } from '../common/taipei-date';
import { FinanceAccountType, FinanceLoanDirection, FinanceTransactionType, StockTransactionType } from '../../generated/prisma/client.js';

type Args = Record<string, unknown>;

/** A write that only runs after the user confirms in a later message —
 * the agent stores it as its `pendingAiAction`. */
export type RecordPending =
  | { kind: 'loan'; summary: string; data: { direction: FinanceLoanDirection; counterpartyName: string; amount: number; accountId: string; date: string; note?: string; dueDate?: string } }
  | { kind: 'loan_repayment'; summary: string; data: { loanId: string; amount: number; accountId: string; date: string } }
  | { kind: 'advance'; summary: string; data: { title: string; amount: number; accountId: string; date: string; note?: string } }
  | { kind: 'advance_repayment'; summary: string; data: { advanceId: string; amount: number; accountId: string; date: string } }
  | { kind: 'stock_trade'; summary: string; data: { type: StockTransactionType; stockCode: string; shares: number; pricePerShare: number; accountId: string; tradeDate: string } }
  | { kind: 'delete'; summary: string; data: { entity: 'transaction' | 'todo' | 'calendar_event'; id: string } }
  | { kind: 'card_payment'; summary: string; data: { cardId: string; fromAccountId: string; amount: number; date: string } };

const optionalAccount = { accountName: { type: 'string', description: '使用者有講才填；沒講系統會挑最常用的，確認時一起問' } };
const optionalDate = { date: { type: 'string', description: 'YYYY-MM-DD，不填＝今天' } };

/** 借貸／代墊、修改／刪除記錄、講的記股票買賣（2026-10-01 使用者要求 AI
 * 補齊）。會動到錢或刪東西的一律先提議、等下一則訊息確認。 */
export const RECORD_TOOLS = [
  {
    type: 'function' as const,
    name: 'get_credit_card_bills',
    description:
      '每張設好結帳日/繳款日的信用卡，下一期繳款日、還剩幾天、要繳多少（estimated=true 表示還沒結帳、是用目前欠款估的）、扣款帳戶、有沒有自動扣繳。另外列出還沒設定日期的信用卡。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'set_credit_card',
    description:
      '設定信用卡的結帳日、繳款日（每月幾號 1-31）、扣款帳戶、是否自動扣繳。只填使用者有講的欄位。設好後系統會在繳款日前 3 天和當天 LINE 提醒。',
    parameters: {
      type: 'object',
      properties: {
        cardName: { type: 'string', description: '信用卡帳戶名稱' },
        statementDay: { type: 'number' },
        paymentDueDay: { type: 'number' },
        paymentAccountName: { type: 'string', description: '從哪個帳戶繳（通常是銀行）' },
        autoPay: { type: 'boolean', description: '有綁自動扣繳＝true' },
      },
      required: ['cardName'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_card_payment',
    description:
      '繳信用卡費：記一筆從扣款帳戶轉到信用卡的轉帳。cardName 沒講而且只有一張卡要繳就用那張；amount 沒講就用這期應繳金額；accountName 沒講就用卡片設定的扣款帳戶。回傳 needsConfirmation，要問使用者確認。',
    parameters: {
      type: 'object',
      properties: { cardName: { type: 'string' }, amount: { type: 'number' }, ...optionalAccount, ...optionalDate },
    },
  },
  {
    type: 'function' as const,
    name: 'list_loans_and_advances',
    description: '列出還沒結清的借貸（我借出去／我借來的，含 id、對象、還欠多少）跟代墊（含 id、事由、還沒收回多少）。',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function' as const,
    name: 'propose_loan',
    description:
      '登記一筆借貸：LEND＝我借錢給別人，BORROW＝我跟別人借錢。有講什麼時候還就填 dueDate（約定還款日，會提醒）。回傳 needsConfirmation，要問使用者確認。',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['LEND', 'BORROW'] },
        counterpartyName: { type: 'string' },
        amount: { type: 'number' },
        note: { type: 'string' },
        dueDate: { type: 'string', description: '約定還款日 YYYY-MM-DD，沒講就不填' },
        ...optionalAccount,
        ...optionalDate,
      },
      required: ['direction', 'counterpartyName', 'amount'],
    },
  },
  {
    type: 'function' as const,
    name: 'set_loan_due_date',
    description:
      '設定或改借貸的約定還款日（loanId 從 list_loans_and_advances 取得），dueDate 給空字串＝取消。設好後前 3 天、當天、過期每 7 天會 LINE 提醒。',
    parameters: {
      type: 'object',
      properties: { loanId: { type: 'string' }, dueDate: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['loanId', 'dueDate'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_loan_repayment',
    description: '登記借貸的還款／收回一部分或全部。loanId 從 list_loans_and_advances 取得。',
    parameters: {
      type: 'object',
      properties: { loanId: { type: 'string' }, amount: { type: 'number' }, ...optionalAccount, ...optionalDate },
      required: ['loanId', 'amount'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_advance',
    description: '登記一筆代墊（先幫別人或工作出的錢，之後會收回），title 是事由。',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, amount: { type: 'number' }, note: { type: 'string' }, ...optionalAccount, ...optionalDate },
      required: ['title', 'amount'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_advance_repayment',
    description: '登記代墊收回。advanceId 從 list_loans_and_advances 取得。',
    parameters: {
      type: 'object',
      properties: { advanceId: { type: 'string' }, amount: { type: 'number' }, ...optionalAccount, ...optionalDate },
      required: ['advanceId', 'amount'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_stock_trade',
    description:
      '記一筆股票買賣（例如「買了 3 張 0050 成交 152」→ shares=3000）。一張＝1000 股，零股就照股數。股票代碼不確定就先問。回傳 needsConfirmation。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['BUY', 'SELL'] },
        stockCode: { type: 'string' },
        shares: { type: 'number' },
        pricePerShare: { type: 'number' },
        ...optionalAccount,
        ...optionalDate,
      },
      required: ['type', 'stockCode', 'shares', 'pricePerShare'],
    },
  },
  {
    type: 'function' as const,
    name: 'update_transaction',
    description: '修改一筆記帳（「剛剛那筆改成 150」「那筆是交通不是餐飲」）。transactionId 先用 list_finance_transactions 找。只填要改的欄位。',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string' },
        amount: { type: 'number' },
        categoryName: { type: 'string' },
        accountName: { type: 'string' },
        note: { type: 'string' },
        ...optionalDate,
      },
      required: ['transactionId'],
    },
  },
  {
    type: 'function' as const,
    name: 'update_todo',
    description: '修改代辦（改名稱、改日期、改備註）。todoId 從 list_todos 取得。只填要改的欄位。',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' },
        title: { type: 'string' },
        dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        notes: { type: 'string' },
      },
      required: ['todoId'],
    },
  },
  {
    type: 'function' as const,
    name: 'update_calendar_event',
    description: '修改行程（改時間、改名稱、改地點）。eventId 從 list_calendar_events 取得；重複行程（recurring=true）不能用這個改，請他到 App 改。',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        startTime: { type: 'string', description: 'HH:mm' },
        endTime: { type: 'string', description: 'HH:mm' },
        location: { type: 'string' },
      },
      required: ['eventId'],
    },
  },
  {
    type: 'function' as const,
    name: 'propose_delete',
    description: '刪除一筆記帳、代辦或行程（先查出 id）。回傳 needsConfirmation，一定要使用者確認才會刪。',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['transaction', 'todo', 'calendar_event'] },
        id: { type: 'string' },
      },
      required: ['entity', 'id'],
    },
  },
];

export const RECORD_AI_GUIDE =
  '信用卡：問卡費、要繳多少 → get_credit_card_bills；說結帳日/繳款日/扣款帳戶/自動扣繳 → set_credit_card；說卡費繳好了、要繳卡費 → propose_card_payment。借錢、還錢、代墊、收回、股票買賣、繳卡費、刪除 → 用 propose_* 提議，等他確認才 confirm_pending_action；改記錯的資料（金額、分類、日期、名稱）直接 update_*，改完說改了什麼。要改或刪之前先用 list_ 工具找到正確那一筆，找到好幾筆就先問是哪一筆。';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

@Injectable()
export class RecordToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loans: FinanceLoansService,
    private readonly advances: FinanceAdvancesService,
    private readonly transactions: FinanceTransactionsService,
    private readonly todos: TodosService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly stockTransactions: StocksTransactionsService,
    private readonly creditCards: CreditCardService,
    private readonly accounts: FinanceAccountsService,
  ) {}

  static readonly toolNames = new Set(RECORD_TOOLS.map((t) => t.name));

  /** Returns either a plain result or `{ pending }` for the agent to hold. */
  async execute(userId: string, name: string, args: Args): Promise<unknown | { pending: RecordPending }> {
    const spaceId = await this.personalSpaceId(userId);
    const today = taipeiDateKey(new Date());
    const date = typeof args.date === 'string' && args.date ? args.date : today;
    const amount = Number(args.amount);

    switch (name) {
      case 'get_credit_card_bills': {
        const bills = await this.creditCards.bills(spaceId, today);
        const unset = await this.prisma.financeAccount.findMany({
          where: { spaceId, type: FinanceAccountType.CREDIT_CARD, OR: [{ statementDay: null }, { paymentDueDay: null }] },
          select: { name: true },
        });
        return { bills, cardsWithoutDates: unset.map((a) => a.name) };
      }
      case 'set_credit_card':
        return this.setCreditCard(userId, spaceId, args);
      case 'propose_card_payment':
        return this.proposeCardPayment(spaceId, args, date, today);
      case 'list_loans_and_advances': {
        const [loans, advances] = await Promise.all([
          this.loans.list(userId, spaceId, { settled: false }),
          this.advances.list(userId, spaceId, { settled: false }),
        ]);
        return {
          loans: loans.items.map((l) => ({
            id: l.id,
            direction: l.direction === FinanceLoanDirection.LEND ? '我借出' : '我借入',
            counterparty: l.counterpartyName,
            outstanding: l.outstanding,
            dueDate: l.dueDate ? utcDateKey(l.dueDate) : null,
          })),
          advances: advances.items.map((a) => ({ id: a.id, title: a.title, outstanding: a.outstanding })),
        };
      }
      case 'propose_loan': {
        if (!(amount > 0)) throw new Error('金額要大於 0');
        const account = await this.resolveAccount(spaceId, args.accountName);
        const direction = args.direction === 'BORROW' ? FinanceLoanDirection.BORROW : FinanceLoanDirection.LEND;
        const who = String(args.counterpartyName ?? '').trim();
        if (!who) throw new Error('要知道是跟誰借貸');
        const dueDate = typeof args.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dueDate) ? args.dueDate : undefined;
        const summary = `${direction === FinanceLoanDirection.LEND ? `借出 ${fmt(amount)} 給${who}，從` : `跟${who}借 ${fmt(amount)}，存進`}「${account.name}」（${date}）${dueDate ? `，約好 ${dueDate} 還` : ''}`;
        return { pending: { kind: 'loan', summary, data: { direction, counterpartyName: who, amount, accountId: account.id, date, ...(typeof args.note === 'string' && args.note && { note: args.note }), ...(dueDate && { dueDate }) } } };
      }
      case 'set_loan_due_date': {
        const raw = String(args.dueDate ?? '').trim();
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('日期要是 YYYY-MM-DD');
        const loan = await this.loans.update(userId, spaceId, String(args.loanId ?? ''), { dueDate: raw || null });
        return { saved: true, counterparty: loan.counterpartyName, dueDate: raw || '已取消', reminders: raw ? '前 3 天、當天、過期每 7 天提醒' : null };
      }
      case 'propose_loan_repayment': {
        if (!(amount > 0)) throw new Error('金額要大於 0');
        const loan = (await this.loans.list(userId, spaceId, { settled: false })).items.find((l) => l.id === args.loanId);
        if (!loan) throw new Error('找不到這筆借貸，先 list_loans_and_advances');
        const account = await this.resolveAccount(spaceId, args.accountName);
        const summary = `${loan.direction === FinanceLoanDirection.LEND ? `${loan.counterpartyName}還你` : `你還${loan.counterpartyName}`} ${fmt(amount)}，帳戶「${account.name}」（還欠 ${fmt(loan.outstanding)}）`;
        return { pending: { kind: 'loan_repayment', summary, data: { loanId: loan.id, amount, accountId: account.id, date } } };
      }
      case 'propose_advance': {
        if (!(amount > 0)) throw new Error('金額要大於 0');
        const account = await this.resolveAccount(spaceId, args.accountName);
        const title = String(args.title ?? '').trim() || '代墊';
        const summary = `代墊「${title}」${fmt(amount)}，從「${account.name}」付（${date}）`;
        return { pending: { kind: 'advance', summary, data: { title, amount, accountId: account.id, date, ...(typeof args.note === 'string' && args.note && { note: args.note }) } } };
      }
      case 'propose_advance_repayment': {
        if (!(amount > 0)) throw new Error('金額要大於 0');
        const advance = (await this.advances.list(userId, spaceId, { settled: false })).items.find((a) => a.id === args.advanceId);
        if (!advance) throw new Error('找不到這筆代墊，先 list_loans_and_advances');
        const account = await this.resolveAccount(spaceId, args.accountName);
        const summary = `代墊「${advance.title}」收回 ${fmt(amount)}，存進「${account.name}」（還沒收回 ${fmt(advance.outstanding)}）`;
        return { pending: { kind: 'advance_repayment', summary, data: { advanceId: advance.id, amount, accountId: account.id, date } } };
      }
      case 'propose_stock_trade': {
        const shares = Number(args.shares);
        const price = Number(args.pricePerShare);
        const stockCode = String(args.stockCode ?? '').trim();
        if (!/^\d{4,6}[A-Z]?$/.test(stockCode)) throw new Error('股票代碼要是 4-6 位數字');
        if (!(shares > 0) || !(price > 0)) throw new Error('股數和成交價都要大於 0');
        const account = await this.resolveAccount(spaceId, args.accountName, 'stock');
        const type = args.type === 'SELL' ? StockTransactionType.SELL : StockTransactionType.BUY;
        const summary = `${type === StockTransactionType.BUY ? '買進' : '賣出'} ${stockCode} ${fmt(shares)} 股，成交價 ${price}，金額 ${fmt(shares * price)}，交割帳戶「${account.name}」（${date}）`;
        return { pending: { kind: 'stock_trade', summary, data: { type, stockCode, shares, pricePerShare: price, accountId: account.id, tradeDate: date } } };
      }
      case 'update_transaction':
        return this.updateTransaction(userId, spaceId, args);
      case 'update_todo': {
        const todo = await this.todos.update(userId, String(args.todoId), {
          ...(typeof args.title === 'string' && args.title && { title: args.title }),
          ...(typeof args.dueDate === 'string' && args.dueDate && { dueDate: args.dueDate, isOngoing: false }),
          ...(typeof args.notes === 'string' && { notes: args.notes }),
        });
        return { updated: todo.title, dueDate: todo.dueDate ? taipeiDateKey(todo.dueDate) : null };
      }
      case 'update_calendar_event':
        return this.updateEvent(userId, args);
      case 'propose_delete':
        return this.proposeDelete(userId, spaceId, args);
      default:
        throw new Error(`未知的工具：${name}`);
    }
  }

  /** Runs a confirmed pending action. */
  async run(userId: string, pending: RecordPending): Promise<unknown> {
    const spaceId = await this.personalSpaceId(userId);
    switch (pending.kind) {
      case 'loan':
        await this.loans.create(userId, spaceId, pending.data);
        break;
      case 'loan_repayment': {
        const { loanId, ...dto } = pending.data;
        await this.loans.addRepayment(userId, spaceId, loanId, dto);
        break;
      }
      case 'advance':
        await this.advances.create(userId, spaceId, pending.data);
        break;
      case 'advance_repayment': {
        const { advanceId, ...dto } = pending.data;
        await this.advances.addRepayment(userId, spaceId, advanceId, dto);
        break;
      }
      case 'stock_trade':
        await this.stockTransactions.create(userId, spaceId, pending.data);
        break;
      case 'delete':
        await this.runDelete(userId, spaceId, pending.data);
        break;
      case 'card_payment': {
        const { cardId, fromAccountId, amount, date } = pending.data;
        await this.creditCards.pay(userId, spaceId, cardId, fromAccountId, amount, date);
        break;
      }
    }
    return { done: pending.summary };
  }

  private async findCard(spaceId: string, name: unknown) {
    const cards = await this.prisma.financeAccount.findMany({
      where: { spaceId, type: FinanceAccountType.CREDIT_CARD },
      orderBy: { sortOrder: 'asc' },
    });
    if (cards.length === 0) throw new Error('還沒有信用卡帳戶，請先到 App 的記帳新增一個「信用卡」類型的帳戶');
    const wanted = typeof name === 'string' ? name.trim() : '';
    if (!wanted) return cards.length === 1 ? cards[0] : null;
    const match = cards.find((c) => c.name === wanted) ?? cards.find((c) => c.name.includes(wanted) || wanted.includes(c.name));
    if (!match) throw new Error(`沒有「${wanted}」這張卡，信用卡有：${cards.map((c) => c.name).join('、')}`);
    return match;
  }

  private async setCreditCard(userId: string, spaceId: string, args: Args) {
    const card = await this.findCard(spaceId, args.cardName);
    if (!card) throw new Error('有好幾張信用卡，要先問是哪一張');
    const day = (v: unknown) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 31) throw new Error('日期要是每月 1～31 號');
      return n;
    };
    const payFrom =
      typeof args.paymentAccountName === 'string' && args.paymentAccountName.trim()
        ? await this.resolveAccount(spaceId, args.paymentAccountName)
        : null;
    const updated = await this.accounts.update(userId, spaceId, card.id, {
      statementDay: day(args.statementDay),
      paymentDueDay: day(args.paymentDueDay),
      ...(payFrom && { paymentAccountId: payFrom.id }),
      ...(typeof args.autoPay === 'boolean' && { cardAutoPay: args.autoPay }),
    });
    const accounts = await this.prisma.financeAccount.findMany({ where: { spaceId }, select: { id: true, name: true } });
    return {
      saved: true,
      card: updated.name,
      statementDay: updated.statementDay,
      paymentDueDay: updated.paymentDueDay,
      paymentAccount: accounts.find((a) => a.id === updated.paymentAccountId)?.name ?? null,
      autoPay: updated.cardAutoPay,
      missing: [updated.statementDay == null && '結帳日', updated.paymentDueDay == null && '繳款日'].filter(Boolean),
    };
  }

  private async proposeCardPayment(spaceId: string, args: Args, date: string, today: string) {
    const card = await this.findCard(spaceId, args.cardName);
    const bills = await this.creditCards.bills(spaceId, today);
    const bill = card ? bills.find((b) => b.accountId === card.id) : bills.filter((b) => b.amount > 0).length === 1 ? bills.find((b) => b.amount > 0) : undefined;
    const target = card ?? (bill ? await this.prisma.financeAccount.findUnique({ where: { id: bill.accountId } }) : null);
    if (!target) throw new Error('有好幾張信用卡，要先問繳的是哪一張');
    const amount = Number(args.amount) > 0 ? Number(args.amount) : (bill?.amount ?? 0);
    if (!(amount > 0)) throw new Error('不知道要繳多少，問使用者金額');
    const wantedFrom = typeof args.accountName === 'string' && args.accountName.trim() ? args.accountName : null;
    const from = wantedFrom
      ? await this.resolveAccount(spaceId, wantedFrom)
      : ((target.paymentAccountId && (await this.prisma.financeAccount.findUnique({ where: { id: target.paymentAccountId } }))) ??
        (await this.prisma.financeAccount.findFirst({ where: { spaceId, type: FinanceAccountType.BANK }, orderBy: { sortOrder: 'asc' } })));
    if (!from) throw new Error('不知道從哪個帳戶繳，問使用者');
    const summary = `繳「${target.name}」卡費 ${fmt(amount)} 元，從「${from.name}」轉出（${date}）`;
    return { pending: { kind: 'card_payment', summary, data: { cardId: target.id, fromAccountId: from.id, amount, date } } satisfies RecordPending };
  }

  private async updateTransaction(userId: string, spaceId: string, args: Args) {
    const id = String(args.transactionId ?? '');
    const existing = await this.prisma.financeTransaction.findFirst({ where: { id, spaceId }, include: { category: true, account: true } });
    if (!existing) throw new Error('找不到這筆記帳，先用 list_finance_transactions 查');
    if (existing.financeLoanId || existing.loanRepaymentId || existing.financeAdvanceId || existing.advanceRepaymentId) {
      throw new Error('這筆是借貸／代墊產生的，請到 App 的借貸或代墊裡改');
    }
    let categoryId: string | undefined;
    if (typeof args.categoryName === 'string' && args.categoryName) {
      const wanted = args.categoryName;
      const categories = await this.prisma.financeCategory.findMany({ where: { spaceId } });
      const match = categories.find((c) => c.name === wanted) ?? categories.find((c) => c.name.includes(wanted) || wanted.includes(c.name));
      if (!match) throw new Error(`沒有「${wanted}」這個分類，可用的：${categories.map((c) => c.name).join('、')}`);
      categoryId = match.id;
    }
    const accountId = typeof args.accountName === 'string' && args.accountName ? (await this.resolveAccount(spaceId, args.accountName)).id : undefined;
    const updated = await this.transactions.update(userId, spaceId, id, {
      ...(Number(args.amount) > 0 && { amount: Number(args.amount) }),
      ...(categoryId && { categoryId }),
      ...(accountId && { accountId }),
      ...(typeof args.date === 'string' && args.date && { date: args.date }),
      ...(typeof args.note === 'string' && { note: args.note }),
    });
    return {
      before: { amount: existing.amount, category: existing.category?.name ?? null, account: existing.account.name, date: taipeiDateKey(existing.date), note: existing.note },
      after: { amount: updated.amount, date: updated.date.toISOString().slice(0, 10), note: updated.note },
    };
  }

  private async updateEvent(userId: string, args: Args) {
    const calendar = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
    if (!calendar) throw new Error('還沒有行事曆');
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: String(args.eventId ?? ''), spaceId: calendar.id } });
    if (!event) throw new Error('找不到這個行程，先用 list_calendar_events 查');
    if (event.recurrenceFrequency !== 'NONE') throw new Error('這是重複行程，請到 App 改');

    const shifted = new Date(event.startAt.getTime() + 8 * 60 * 60 * 1000);
    const dateKey = typeof args.date === 'string' && args.date ? args.date : shifted.toISOString().slice(0, 10);
    const [y, m, d] = dateKey.split('-').map(Number);
    const at = (clock: string) => {
      const [h, min] = clock.split(':').map(Number);
      return taipeiWallClockToUtc(y, m - 1, d, h, min).toISOString();
    };
    const timeChanged = typeof args.date === 'string' || typeof args.startTime === 'string';
    let startAt: string | undefined;
    let endAt: string | undefined;
    if (timeChanged && !event.allDay) {
      const startClock = typeof args.startTime === 'string' ? args.startTime : `${shifted.getUTCHours()}:${shifted.getUTCMinutes()}`;
      startAt = at(startClock);
      const duration = event.endAt ? event.endAt.getTime() - event.startAt.getTime() : null;
      if (typeof args.endTime === 'string') endAt = at(args.endTime);
      else if (duration != null) endAt = new Date(new Date(startAt).getTime() + duration).toISOString();
    } else if (timeChanged && event.allDay) {
      startAt = new Date(Date.UTC(y, m - 1, d)).toISOString();
    }
    const updated = await this.calendarEvents.update(userId, calendar.id, event.id, {
      ...(typeof args.title === 'string' && args.title && { title: args.title }),
      ...(typeof args.location === 'string' && { location: args.location }),
      ...(startAt && { startAt }),
      ...(endAt && { endAt }),
    });
    return { updated: updated.title, startAt: updated.startAt.toISOString() };
  }

  private async proposeDelete(userId: string, spaceId: string, args: Args) {
    const id = String(args.id ?? '');
    const entity = args.entity === 'todo' ? 'todo' : args.entity === 'calendar_event' ? 'calendar_event' : 'transaction';
    let label: string;
    if (entity === 'transaction') {
      const t = await this.prisma.financeTransaction.findFirst({ where: { id, spaceId }, include: { category: true } });
      if (!t) throw new Error('找不到這筆記帳');
      if (t.financeLoanId || t.loanRepaymentId || t.financeAdvanceId || t.advanceRepaymentId) throw new Error('這筆是借貸／代墊產生的，請到 App 刪');
      label = `記帳 ${taipeiDateKey(t.date)} ${t.category?.name ?? ''} ${fmt(t.amount)}${t.note ? `「${t.note}」` : ''}`;
    } else if (entity === 'todo') {
      const todo = await this.prisma.projectTodo.findFirst({ where: { id, personalOwnerUserId: userId } });
      if (!todo) throw new Error('找不到這個代辦');
      label = `代辦「${todo.title}」`;
    } else {
      const calendar = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
      const event = calendar ? await this.prisma.calendarEvent.findFirst({ where: { id, spaceId: calendar.id } }) : null;
      if (!event) throw new Error('找不到這個行程');
      if (event.recurrenceFrequency !== 'NONE') throw new Error('這是重複行程，請到 App 刪');
      label = `行程「${event.title}」`;
    }
    return { pending: { kind: 'delete', summary: `刪除${label}`, data: { entity, id } } satisfies RecordPending };
  }

  private async runDelete(userId: string, spaceId: string, data: { entity: string; id: string }) {
    if (data.entity === 'transaction') return this.transactions.remove(userId, spaceId, data.id);
    if (data.entity === 'todo') return this.todos.remove(userId, data.id);
    const calendar = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
    if (!calendar) throw new Error('還沒有行事曆');
    return this.calendarEvents.remove(userId, calendar.id, data.id);
  }

  private async personalSpaceId(userId: string): Promise<string> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) throw new Error('找不到個人空間，請先登入 App 一次');
    return space.id;
  }

  /** 指定名稱就找那個；沒指定：股票用上次交割的帳戶，其他用最近 180 天最常用的。 */
  private async resolveAccount(spaceId: string, name: unknown, purpose: 'money' | 'stock' = 'money') {
    const accounts = await this.prisma.financeAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: 'asc' } });
    if (accounts.length === 0) throw new Error('還沒有任何帳戶，請先到 App 的記帳新增帳戶');
    const wanted = typeof name === 'string' ? name.trim() : '';
    if (wanted) {
      const match = accounts.find((a) => a.name === wanted) ?? accounts.find((a) => a.name.includes(wanted) || wanted.includes(a.name));
      if (!match) throw new Error(`沒有「${wanted}」這個帳戶，可用的：${accounts.map((a) => a.name).join('、')}`);
      return match;
    }
    if (purpose === 'stock') {
      const last = await this.prisma.stockTransaction.findFirst({ where: { spaceId }, orderBy: { tradeDate: 'desc' } });
      const account = last && accounts.find((a) => a.id === last.accountId);
      if (account) return account;
    }
    const top = await this.prisma.financeTransaction.groupBy({
      by: ['accountId'],
      where: { spaceId, type: { in: [FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE] }, date: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
      _count: { accountId: true },
      orderBy: { _count: { accountId: 'desc' } },
      take: 1,
    });
    return accounts.find((a) => a.id === top[0]?.accountId) ?? accounts[0];
  }
}
