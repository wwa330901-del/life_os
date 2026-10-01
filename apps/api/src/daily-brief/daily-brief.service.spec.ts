import { DailyBriefService } from './daily-brief.service';

// Thursday 2026-10-01 08:00 Taipei.
const NOW = new Date('2026-10-01T00:00:00Z');

function makeService(opts: { empty?: boolean; sleeps?: Array<{ date: Date; minutes: number }> } = {}) {
  const prisma = {
    space: {
      findUnique: jest.fn(({ where }) => Promise.resolve(where.ownerUserId ? { id: 'personal' } : { id: 'calendar' })),
    },
    projectTodo: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          opts.empty
            ? []
            : where.dueDate.gte
              ? [{ title: '繳電話費', dueDate: new Date('2026-10-01T07:00:00Z'), dueDateAllDay: false }]
              : [{ title: '整理房間' }],
        ),
      ),
    },
  };
  const calendarEvents = {
    list: jest.fn().mockResolvedValue(opts.empty ? [] : [{ title: '看牙醫', startAt: new Date('2026-10-01T06:30:00Z'), allDay: false }]),
  };
  const transactions = {
    rangeSummary: jest.fn().mockResolvedValue({ totalIncome: 0, totalExpense: opts.empty ? 0 : 420, net: 0, byCategory: [] }),
  };
  const budgets = {
    monthlyStatus: jest.fn().mockResolvedValue(opts.empty ? [] : [{ categoryName: '餐飲', monthlyAmount: 6000, spent: 5100 }]),
  };
  return new DailyBriefService(prisma as never, calendarEvents as never, transactions as never, budgets as never, {} as never, {
    recentSleeps: jest.fn().mockResolvedValue(opts.sleeps ?? []),
  } as never);
}

describe('DailyBriefService.build', () => {
  it('lists today’s events, todos, yesterday’s spending and near-limit budgets', async () => {
    const text = (await makeService().build('u1', NOW))!;
    expect(text).toContain('☀️ 早安！10/1（四）');
    expect(text).toContain('・14:30 看牙醫');
    expect(text).toContain('・繳電話費（15:00）');
    expect(text).toContain('還有 1 件過期：整理房間');
    expect(text).toContain('昨天花了 420');
    expect(text).toContain('🟡 餐飲預算已用 85%（剩 900）');
  });

  it('shows last night’s sleep and warns after 3 short nights', async () => {
    const night = (day: string, minutes: number) => ({ date: new Date(`${day}T00:00:00Z`), minutes });
    const ok = (await makeService({ sleeps: [night('2026-10-01', 430)] }).build('u1', NOW))!;
    expect(ok).toContain('昨晚睡了 7 小時 10 分');
    expect(ok).not.toContain('連續');
    const short = (await makeService({ sleeps: [night('2026-10-01', 300), night('2026-09-30', 330), night('2026-09-29', 340)] }).build('u1', NOW))!;
    expect(short).toContain('已經連續 3 晚睡不到 6 小時了');
    const stale = (await makeService({ sleeps: [night('2026-09-30', 300)] }).build('u1', NOW))!;
    expect(stale).not.toContain('睡眠');
  });

  it('sends nothing on an empty day', async () => {
    expect(await makeService({ empty: true }).build('u1', NOW)).toBeNull();
  });
});
