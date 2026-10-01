import { LifeReviewService } from './life-review.service';
import { FinanceTransactionType, LifeGoalTrackingType } from '../../generated/prisma/client.js';

const SUNDAY_8PM = new Date('2026-10-04T12:00:00Z');

function makeService(overrides: { goals?: unknown[]; holdings?: unknown[] } = {}) {
  const prisma = {
    space: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(where.ownerUserId ? { id: 'personal' } : { id: 'calendar' }),
      ),
    },
    financeNetWorthSnapshot: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(where.date.lte ? { id: 's1', netWorth: 100000 } : { id: 's2', netWorth: 103500 }),
      ),
    },
    projectTodo: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          where.done
            ? [{ title: '交報告' }, { title: '繳電話費' }]
            : [{ title: '整理房間', dueDate: new Date('2026-10-01T00:00:00Z') }],
        ),
      ),
    },
    lifeGoalCheckIn: { groupBy: jest.fn().mockResolvedValue([{ goalId: 'g1', _count: { goalId: 2 } }]) },
    user: { findUnique: jest.fn().mockResolvedValue({ geminiApiKey: null }) },
  };
  const transactions = {
    rangeSummary: jest.fn((_u, _s, start: Date) =>
      Promise.resolve(
        start.toISOString().startsWith('2026-09-28')
          ? {
              totalIncome: 50000,
              totalExpense: 6500,
              net: 43500,
              byCategory: [
                { name: '餐飲', kind: FinanceTransactionType.EXPENSE, total: 3900 },
                { name: '交通', kind: FinanceTransactionType.EXPENSE, total: 1600 },
                { name: '薪水', kind: FinanceTransactionType.INCOME, total: 50000 },
              ],
            }
          : {
              totalIncome: 0,
              totalExpense: 5000,
              net: -5000,
              byCategory: [{ name: '餐飲', kind: FinanceTransactionType.EXPENSE, total: 3000 }],
            },
      ),
    ),
  };
  const budgets = {
    monthlyStatus: jest.fn().mockResolvedValue([{ categoryName: '餐飲', monthlyAmount: 3000, spent: 3900 }]),
  };
  const calendarEvents = {
    list: jest.fn().mockResolvedValue([{ title: '看牙醫', startAt: new Date('2026-10-06T07:00:00Z'), allDay: false }]),
  };
  const goals = {
    listAll: jest.fn().mockResolvedValue(
      overrides.goals ?? [
        {
          id: 'g1',
          title: '一年讀 12 本書',
          trackingType: LifeGoalTrackingType.CHECK_IN,
          currentValue: 3,
          targetValue: 12,
          startValue: 0,
          unit: '本',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          targetDate: new Date('2026-12-31T00:00:00Z'),
        },
      ],
    ),
  };
  const holdings = { list: jest.fn().mockResolvedValue(overrides.holdings ?? []) };
  const history = { daily: jest.fn().mockResolvedValue([]) };
  const lineNotifier = { notifyByUser: jest.fn() };
  const aiUsage = { record: jest.fn() };
  const journal = {
    stats: jest.fn().mockResolvedValue({ entries: 4, days: 3, averageMood: 3.7, topTags: ['工作', '家人'] }),
  };
  return new LifeReviewService(
    prisma as never,
    transactions as never,
    budgets as never,
    calendarEvents as never,
    goals as never,
    holdings as never,
    history as never,
    lineNotifier as never,
    aiUsage as never,
    journal as never,
    { forSpace: jest.fn() } as never,
    {
      list: jest.fn().mockResolvedValue({
        items: [
          { direction: 'LEND', counterpartyName: '小明', outstanding: 3000, initialTransaction: { date: new Date('2026-08-20T00:00:00Z') } },
          { direction: 'LEND', counterpartyName: '阿華', outstanding: 500, initialTransaction: { date: new Date('2026-09-30T00:00:00Z') } },
        ],
      }),
    } as never,
    { list: jest.fn().mockResolvedValue({ items: [] }) } as never,
  );
}

describe('LifeReviewService.build', () => {
  it('builds a weekly review with money, tasks and goals', async () => {
    const text = (await makeService().build('u1', 'week', SUNDAY_8PM))!;
    expect(text).toContain('📅 週回顧（9/28–10/4）');
    expect(text).toContain('支出 6,500（比上週 +30%）');
    expect(text).toContain('收入 50,000，結餘 +43,500');
    expect(text).toContain('花最多：餐飲 3,900（+30%）、交通 1,600');
    expect(text).toContain('10 月預算超支：餐飲 超 900');
    expect(text).toContain('淨資產 103,500（+3,500）');
    expect(text).toContain('完成 2 件代辦：交報告、繳電話費');
    expect(text).toContain('・整理房間（過期 3 天）');
    expect(text).toContain('下週行程');
    expect(text).toContain('看牙醫');
    expect(text).toContain('一年讀 12 本書 25%（3/12本），這期打卡 2 次');
    expect(text).toContain('進度落後：一年讀 12 本書');
    expect(text).toContain('寫了 3 天，平均心情 3.7/5 🙂');
    expect(text).toContain('常寫到：工作、家人');
    expect(text).toContain('・小明 還欠 3,000（借出 45 天）');
    expect(text).not.toContain('健康');
    expect(text).not.toContain('步數');
    expect(text).not.toContain('阿華'); // lent only 4 days ago
    // No stock holdings and no Gemini key → no stock section, no AI line.
    expect(text).not.toContain('📈');
    expect(text).not.toContain('💬');
  });
});
