import { DailyBriefService, nextDailyRemind, todoReminderButtons, todoReminderText } from './daily-brief.service';

// Thursday 2026-10-01 08:00 Taipei.
const NOW = new Date('2026-10-01T00:00:00Z');

function makeService(opts: { empty?: boolean } = {}) {
  const prisma = {
    space: {
      findUnique: jest.fn(({ where }) => Promise.resolve(where.ownerUserId ? { id: 'personal' } : { id: 'calendar' })),
    },
    projectTodo: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          opts.empty
            ? []
            : where.dueDate === null
              ? []
              : where.dueDate.gte
              ? [{ title: '繳電話費', dueDate: new Date('2026-10-01T07:00:00Z'), dueDateAllDay: false }]
              : [{ title: '整理房間' }],
        ),
      ),
    },
  };
  (prisma as Record<string, unknown>).knowledgeItem = {
    findMany: jest.fn(({ where }) =>
      Promise.resolve(
        opts.empty
          ? []
          : where.eventEndDate
            ? [{ title: '奈良美智特展', eventEndDate: new Date('2026-10-04T00:00:00Z') }]
            : [{ title: '巷弄咖啡' }, { title: 'ETF 配息' }],
      ),
    ),
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
  return new DailyBriefService(prisma as never, calendarEvents as never, transactions as never, budgets as never, {} as never);
}

describe('DailyBriefService.build', () => {
  it('lists today’s events, todos, yesterday’s spending and near-limit budgets', async () => {
    const text = (await makeService().build('u1', NOW))!;
    expect(text).toContain('☀️ 早安！10/1（四）');
    expect(text).toContain('・14:30 看牙醫');
    expect(text).toContain('・繳電話費（15:00）');
    expect(text).toContain('🧠 別忘了');
    expect(text).toContain('⏳ 整理房間（過期 1 天）');
    expect(text).toContain('昨天花了 420');
    expect(text).toContain('🟡 餐飲預算已用 85%（剩 900）');
    expect(text).toContain('🧠 大腦');
    expect(text).toContain('・奈良美智特展還剩 3 天');
    expect(text).toMatch(/你存了還沒看：「(巷弄咖啡|ETF 配息)」（還有 1 則沒看）/);
  });

  it('sends nothing on an empty day', async () => {
    expect(await makeService({ empty: true }).build('u1', NOW)).toBeNull();
  });
});

describe('LINE 代辦提醒', () => {
  it('提醒過了就排到隔天同一時間；停機很久也只往後排到下一次', () => {
    const at = new Date('2026-10-06T07:30:00Z');
    expect(nextDailyRemind(at, new Date('2026-10-06T07:30:20Z'))).toEqual(new Date('2026-10-07T07:30:00Z'));
    expect(nextDailyRemind(at, new Date('2026-10-09T08:00:00Z'))).toEqual(new Date('2026-10-10T07:30:00Z'));
  });

  it('第一次說時間到，之後說第幾次', () => {
    const createdAt = new Date('2026-10-06T07:20:00Z');
    expect(todoReminderText({ title: '倒垃圾', remindCount: 0, createdAt })).toContain('⏰ 時間到了：倒垃圾');
    expect(todoReminderText({ title: '倒垃圾', remindCount: 1, createdAt })).toContain('第 2 次提醒');
    expect(todoReminderButtons('t1').map((b) => b.data)).toEqual(['todo:done:t1', 'todo:snooze:t1']);
  });

  it('時間到推播並排下一次；被別人搶先處理就不重傳', async () => {
    const remindAt = new Date('2026-10-06T07:30:00Z');
    const todo = { id: 't1', title: '倒垃圾', remindAt, remindCount: 0, createdAt: remindAt, personalOwnerUserId: 'u1' };
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const prisma = { projectTodo: { findMany: jest.fn().mockResolvedValue([todo]), updateMany } };
    const notifier = { notifyByUser: jest.fn().mockResolvedValue(undefined) };
    const service = new DailyBriefService(prisma as never, {} as never, {} as never, {} as never, notifier as never);
    const now = new Date('2026-10-06T07:30:30Z');
    await service.sendTodoReminders(now);
    await service.sendTodoReminders(now);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 't1', remindAt },
      data: { remindAt: new Date('2026-10-07T07:30:00Z'), remindCount: { increment: 1 } },
    });
    expect(notifier.notifyByUser).toHaveBeenCalledTimes(1);
    expect(notifier.notifyByUser.mock.calls[0][2]).toHaveLength(2);
  });
});

describe('forgetList（早報防忘）', () => {
  const { forgetList } = jest.requireActual('./daily-brief.service') as typeof import('./daily-brief.service');
  const now = new Date('2026-11-22T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('過期的寫過期幾天，沒日期放太久的寫放了幾天', () => {
    expect(forgetList([{ title: '繳電費', dueDate: daysAgo(3) }], [{ title: '整理衣櫃', createdAt: daysAgo(9) }], now)).toEqual([
      '⏳ 繳電費（過期 3 天）',
      '💤 整理衣櫃（放了 9 天）',
    ]);
  });

  it('超過 6 件只列 6 件，其他叫他看代辦', () => {
    const overdue = Array.from({ length: 5 }, (_, i) => ({ title: `過期${i}`, dueDate: daysAgo(2) }));
    const stale = Array.from({ length: 4 }, (_, i) => ({ title: `放著${i}`, createdAt: daysAgo(10) }));
    const lines = forgetList(overdue, stale, now);
    expect(lines).toHaveLength(7);
    expect(lines[5]).toBe('💤 放著0（放了 10 天）');
    expect(lines[6]).toBe('…還有 3 件，傳「代辦事項」看全部');
  });
});
