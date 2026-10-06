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
  return new DailyBriefService(prisma as never, calendarEvents as never, transactions as never, budgets as never, {} as never);
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
    expect(todoReminderButtons('t1').map((b) => b.data)).toEqual(['todo:done:t1', 'todo:snooze:t1:10', 'todo:snooze:t1:60']);
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
    expect(notifier.notifyByUser.mock.calls[0][2]).toHaveLength(3);
  });
});
