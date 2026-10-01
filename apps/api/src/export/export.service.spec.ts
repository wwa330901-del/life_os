import ExcelJS from 'exceljs';
import { ExportService } from './export.service';

const d = (s: string) => new Date(s);

function fakePrisma() {
  const empty = { findMany: jest.fn().mockResolvedValue([]) };
  return {
    space: { findUnique: jest.fn(({ where }) => Promise.resolve(where.ownerUserId ? { id: 'p' } : null)) },
    financeTransaction: {
      findMany: jest.fn().mockResolvedValue([
        {
          date: d('2026-10-01T00:00:00Z'),
          type: 'EXPENSE',
          amount: 120,
          account: { name: '現金' },
          toAccount: null,
          category: { name: '午餐', parent: { name: '餐飲' } },
          note: '便當',
        },
      ]),
    },
    financeAccount: { findMany: jest.fn().mockResolvedValue([{ name: '現金', type: 'CASH', initialBalance: 1000 }]) },
    financeBudget: empty,
    financeLoan: {
      findMany: jest.fn().mockResolvedValue([
        {
          direction: 'LEND',
          counterpartyName: '小明',
          initialTransaction: { date: d('2026-09-01T00:00:00Z'), amount: 3000, note: null },
          repayments: [{ transaction: { amount: 1000 } }],
        },
      ]),
    },
    financeAdvance: empty,
    stockTransaction: empty,
    calendarEvent: empty,
    projectTodo: empty,
    lifeGoal: {
      findMany: jest.fn().mockResolvedValue([
        {
          title: '一年讀 12 本書',
          category: '閱讀',
          status: 'ACTIVE',
          currentValue: 2,
          targetValue: 12,
          unit: '本',
          targetDate: null,
          checkIns: [
            { date: d('2026-09-10T00:00:00Z'), title: '原子習慣', note: '小改變' },
            { date: d('2026-09-20T00:00:00Z'), title: '刻意練習', note: null },
          ],
        },
      ]),
    },
    journalEntry: empty,
    healthRecord: {
      findMany: jest.fn().mockResolvedValue([
        { date: d('2026-10-01T00:00:00Z'), type: 'SLEEP', minutes: 435, startAt: d('2026-09-30T15:30:00Z'), endAt: d('2026-09-30T22:45:00Z'), note: null },
      ]),
    },
    divinationRecord: empty,
    knowledgeItem: empty,
  };
}

describe('ExportService', () => {
  it('writes one sheet per kind of data, in Chinese', async () => {
    const buffer = await new ExportService(fakePrisma() as never).buildWorkbook('u1');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      '記帳', '帳戶', '預算', '借貸', '代墊', '股票交易', '行事曆', '代辦', '人生目標', '日記', '健康', '算命', '知識庫',
    ]);
    const values = (sheet: string, row: number) => (workbook.getWorksheet(sheet)!.getRow(row).values as unknown[]).slice(1);
    expect(values('記帳', 2)).toEqual(['2026-10-01', '支出', 120, '現金', undefined, '餐飲', '午餐', '便當']);
    expect(values('帳戶', 2)).toEqual(['現金', '現金', 1000]);
    expect(values('借貸', 2)).toEqual(['2026-09-01', '借出', '小明', 3000, 1000]);
    expect(values('人生目標', 2)).toEqual(['一年讀 12 本書', '閱讀', '進行中', 2, 12, '本', undefined, '2026-09-10', '原子習慣：小改變']);
    expect(values('人生目標', 3)[0]).toBe('一年讀 12 本書');
    expect(values('人生目標', 3)[8]).toBe('刻意練習');
    expect(values('健康', 2)).toEqual(['2026-10-01', '睡眠', '7 小時 15 分', '2026-09-30 23:30', '2026-10-01 06:45']);
  });
});
