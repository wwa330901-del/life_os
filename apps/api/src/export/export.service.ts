import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { taipeiDateKey, utcDateKey } from '../common/taipei-date';
import { ACCURACY_LABEL } from '../divination/divination.service';

type Cell = string | number | null;
interface Sheet {
  name: string;
  columns: Array<{ header: string; width: number }>;
  rows: Cell[][];
}

const TX_TYPE: Record<string, string> = {
  INCOME: '收入',
  EXPENSE: '支出',
  TRANSFER: '轉帳',
  LOAN_OUT: '借貸（錢出去）',
  LOAN_IN: '借貸（錢進來）',
  ADVANCE_OUT: '代墊',
  ADVANCE_IN: '代墊收回',
};
const ACCOUNT_TYPE: Record<string, string> = { CASH: '現金', BANK: '銀行', CREDIT_CARD: '信用卡', OTHER: '其他' };
const GOAL_STATUS: Record<string, string> = { ACTIVE: '進行中', COMPLETED: '完成', ABANDONED: '放棄' };
const PRIORITY: Record<string, string> = { HIGH: '高', MEDIUM: '中', LOW: '低' };

/** Taipei "YYYY-MM-DD HH:mm" for a real instant. */
function taipeiDateTime(date: Date | null | undefined): string | null {
  if (!date) return null;
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${taipeiDateKey(date)} ${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

/** For `@db.Date` columns. */
function day(date: Date | null | undefined): string | null {
  return date ? utcDateKey(date) : null;
}

/** 資料匯出（2026-10-01）：一個 Excel，每種資料一張工作表，給使用者自己留備份。 */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildWorkbook(userId: string): Promise<Buffer> {
    const sheets = await this.collect(userId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '元序';
    workbook.created = new Date();
    for (const sheet of sheets) {
      const ws = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width }));
      ws.getRow(1).font = { bold: true };
      ws.addRows(sheet.rows);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Exported for tests: every sheet as plain rows. */
  async collect(userId: string): Promise<Sheet[]> {
    const [personal, calendar] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
    ]);
    const spaceId = personal?.id ?? '__none__';

    const [transactions, accounts, budgets, loans, advances, stocks, events, todos, goals, journal, divinations, knowledge] =
      await Promise.all([
        this.prisma.financeTransaction.findMany({
          where: { spaceId },
          include: { account: true, toAccount: true, category: { include: { parent: true } } },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.financeAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.financeBudget.findMany({ where: { spaceId }, include: { category: true } }),
        this.prisma.financeLoan.findMany({
          where: { spaceId },
          include: { initialTransaction: true, repayments: { include: { transaction: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.financeAdvance.findMany({
          where: { spaceId },
          include: { initialTransaction: true, repayments: { include: { transaction: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.stockTransaction.findMany({ where: { spaceId }, include: { account: true }, orderBy: { tradeDate: 'asc' } }),
        calendar
          ? this.prisma.calendarEvent.findMany({ where: { spaceId: calendar.id }, orderBy: { startAt: 'asc' } })
          : Promise.resolve([]),
        this.prisma.projectTodo.findMany({ where: { personalOwnerUserId: userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.lifeGoal.findMany({ where: { ownerUserId: userId }, include: { checkIns: { orderBy: { date: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
        this.prisma.journalEntry.findMany({ where: { ownerUserId: userId }, orderBy: { date: 'asc' } }),
        this.prisma.divinationRecord.findMany({ where: { ownerUserId: userId }, orderBy: { castAt: 'asc' } }),
        this.prisma.knowledgeItem.findMany({ where: { ownerUserId: userId }, include: { category: true }, orderBy: { createdAt: 'asc' } }),
      ]);

    const sum = (ts: Array<{ transaction: { amount: number } | null }>) => ts.reduce((a, r) => a + (r.transaction?.amount ?? 0), 0);

    return [
      {
        name: '記帳',
        columns: [
          { header: '日期', width: 12 },
          { header: '類型', width: 8 },
          { header: '金額', width: 12 },
          { header: '帳戶', width: 14 },
          { header: '轉入帳戶', width: 14 },
          { header: '母分類', width: 12 },
          { header: '分類', width: 12 },
          { header: '備註', width: 30 },
        ],
        rows: transactions.map((t) => [
          day(t.date),
          TX_TYPE[t.type] ?? t.type,
          t.amount,
          t.account.name,
          t.toAccount?.name ?? null,
          t.category?.parent?.name ?? null,
          t.category?.name ?? null,
          t.note,
        ]),
      },
      {
        name: '帳戶',
        columns: [
          { header: '名稱', width: 16 },
          { header: '類型', width: 12 },
          { header: '期初餘額', width: 12 },
        ],
        rows: accounts.map((a) => [a.name, ACCOUNT_TYPE[a.type] ?? a.type, a.initialBalance]),
      },
      {
        name: '預算',
        columns: [
          { header: '分類', width: 14 },
          { header: '每月預算', width: 12 },
        ],
        rows: budgets.map((b) => [b.category.name, b.monthlyAmount]),
      },
      {
        name: '借貸',
        columns: [
          { header: '日期', width: 12 },
          { header: '方向', width: 8 },
          { header: '對象', width: 12 },
          { header: '金額', width: 12 },
          { header: '已還', width: 12 },
          { header: '備註', width: 30 },
        ],
        rows: loans.map((l) => [
          day(l.initialTransaction?.date ?? l.openingDate),
          l.direction === 'LEND' ? '借出' : '借入',
          l.counterpartyName,
          l.initialTransaction?.amount ?? l.openingAmount ?? null,
          sum(l.repayments),
          l.initialTransaction?.note ?? l.openingNote ?? (l.openingAmount != null ? '期初借貸' : null),
        ]),
      },
      {
        name: '代墊',
        columns: [
          { header: '日期', width: 12 },
          { header: '事由', width: 20 },
          { header: '金額', width: 12 },
          { header: '已收回', width: 12 },
          { header: '結清', width: 8 },
        ],
        rows: advances.map((a) => [day(a.initialTransaction?.date), a.title, a.initialTransaction?.amount ?? null, sum(a.repayments), a.settled ? '是' : '否']),
      },
      {
        name: '股票交易',
        columns: [
          { header: '成交日', width: 12 },
          { header: '代號', width: 8 },
          { header: '買賣', width: 6 },
          { header: '股數', width: 10 },
          { header: '每股價格', width: 10 },
          { header: '總金額', width: 12 },
          { header: '帳戶', width: 14 },
          { header: '備註', width: 24 },
        ],
        rows: stocks.map((s) => [day(s.tradeDate), s.stockCode, s.type === 'BUY' ? '買' : '賣', s.shares, s.pricePerShare, s.totalCost, s.account.name, s.note]),
      },
      {
        name: '行事曆',
        columns: [
          { header: '開始', width: 18 },
          { header: '結束', width: 18 },
          { header: '全天', width: 6 },
          { header: '標題', width: 28 },
          { header: '地點', width: 18 },
          { header: '備註', width: 30 },
        ],
        rows: events.map((e) => [
          e.allDay ? taipeiDateKey(e.startAt) : taipeiDateTime(e.startAt),
          e.allDay ? (e.endAt ? taipeiDateKey(e.endAt) : null) : taipeiDateTime(e.endAt),
          e.allDay ? '是' : '',
          e.title,
          e.location,
          e.notes,
        ]),
      },
      {
        name: '代辦',
        columns: [
          { header: '標題', width: 30 },
          { header: '到期', width: 18 },
          { header: '優先', width: 6 },
          { header: '完成', width: 6 },
          { header: '完成時間', width: 18 },
          { header: '備註', width: 30 },
        ],
        rows: todos.map((t) => [
          t.title,
          t.isOngoing ? '長期' : t.dueDateAllDay ? (t.dueDate ? taipeiDateKey(t.dueDate) : null) : taipeiDateTime(t.dueDate),
          PRIORITY[t.priority] ?? t.priority,
          t.done ? '是' : '',
          taipeiDateTime(t.completedAt),
          t.notes,
        ]),
      },
      {
        name: '人生目標',
        columns: [
          { header: '目標', width: 26 },
          { header: '分類', width: 10 },
          { header: '狀態', width: 8 },
          { header: '目前', width: 10 },
          { header: '目標值', width: 10 },
          { header: '單位', width: 6 },
          { header: '期限', width: 12 },
          { header: '打卡日期', width: 12 },
          { header: '打卡內容', width: 30 },
        ],
        rows: goals.flatMap((g) => {
          const head: Cell[] = [g.title, g.category, GOAL_STATUS[g.status] ?? g.status, g.currentValue, g.targetValue, g.unit, day(g.targetDate)];
          if (g.checkIns.length === 0) return [[...head, null, null]];
          return g.checkIns.map((c, i) => [...(i === 0 ? head : [g.title, null, null, null, null, null, null]), day(c.date), [c.title, c.note].filter(Boolean).join('：') || null]);
        }),
      },
      {
        name: '日記',
        columns: [
          { header: '日期', width: 12 },
          { header: '心情(1-5)', width: 10 },
          { header: '標籤', width: 16 },
          { header: '內容', width: 80 },
        ],
        rows: journal.map((j) => [day(j.date), j.mood, j.tags.join('、'), j.content]),
      },
      {
        name: '算命',
        columns: [
          { header: '時間', width: 18 },
          { header: '問題', width: 26 },
          { header: '卦', width: 12 },
          { header: '準不準', width: 8 },
          { header: '事後回饋', width: 24 },
          { header: '解卦', width: 80 },
        ],
        rows: divinations.map((d) => [taipeiDateTime(d.castAt), d.question, d.hexagram, d.accuracy ? ACCURACY_LABEL[d.accuracy] : null, d.feedback, d.interpretation]),
      },
      {
        name: '知識庫',
        columns: [
          { header: '收藏日', width: 12 },
          { header: '分類', width: 12 },
          { header: '標題', width: 30 },
          { header: '摘要', width: 50 },
          { header: '標籤', width: 16 },
          { header: '連結', width: 40 },
        ],
        rows: knowledge.map((k) => [taipeiDateKey(k.createdAt), k.category?.name ?? null, k.title, k.summary, k.tags.join('、'), k.sourceUrl]),
      },
    ];
  }
}
