import { LineTodoCommandsService } from './line-todo-commands.service';
import { buttonMessage } from '../line-notifier/line-notifier.service';

function setup(link: Record<string, unknown>, todo: Record<string, unknown> | null = { id: 't1', title: '關火', personalOwnerUserId: 'u1', done: false }) {
  const prisma = {
    projectTodo: {
      findUnique: jest.fn().mockResolvedValue(todo),
      findFirst: jest.fn().mockResolvedValue(todo),
      update: jest.fn().mockResolvedValue(undefined),
    },
    lineAccountLink: { update: jest.fn().mockResolvedValue(undefined) },
  };
  const service = Object.create(LineTodoCommandsService.prototype) as Record<string, unknown>;
  const reply = jest.fn().mockResolvedValue(undefined);
  const callReplyApi = jest.fn().mockResolvedValue(undefined);
  const todosService = { update: jest.fn().mockResolvedValue(undefined) };
  Object.assign(service, { prisma, out: { reply, callReplyApi }, todosService });
  const call = (name: string, ...args: unknown[]) => (service[name] as (...a: unknown[]) => Promise<unknown>).apply(service, args);
  return { prisma, reply, callReplyApi, todosService, call, link: { id: 'l1', userId: 'u1', ...link } };
}

describe('提醒的延後', () => {
  it('按「延後」先問時間，記下在等哪一件', async () => {
    const { call, link, prisma, callReplyApi } = setup({});
    await call('handleTodoPostback', link, 'todo:snooze:t1', 'r');
    expect(prisma.projectTodo.update).not.toHaveBeenCalled();
    expect(prisma.lineAccountLink.update.mock.calls[0][0].data.pendingSnoozeTodoId).toBe('t1');
    const message = callReplyApi.mock.calls[0][0].messages[0];
    expect(message.text).toContain('關火');
    expect(message.quickReply.items[0].action).toMatchObject({ type: 'datetimepicker', data: 'todo:snooze-at:t1', mode: 'datetime' });
    expect(message.quickReply.items[0].action.initial).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('打時間就延後到那時候，等待狀態清掉', async () => {
    const { call, link, prisma, reply } = setup({ pendingSnoozeTodoId: 't1', pendingSnoozeAt: new Date() });
    const before = Date.now();
    await expect(call('tryResolveSnooze', link, '30分', 'r')).resolves.toBe(true);
    const at = prisma.projectTodo.update.mock.calls[0][0].data.remindAt as Date;
    expect(at.getTime() - before).toBeGreaterThanOrEqual(30 * 60 * 1000);
    expect(prisma.lineAccountLink.update.mock.calls[0][0].data.pendingSnoozeTodoId).toBeNull();
    expect(reply.mock.calls[0][1]).toContain('關火');
  });

  it('打的不是時間：不延後、交回一般訊息處理', async () => {
    const { call, link, prisma, reply } = setup({ pendingSnoozeTodoId: 't1', pendingSnoozeAt: new Date() });
    await expect(call('tryResolveSnooze', link, '財務總覽', 'r')).resolves.toBe(false);
    expect(prisma.projectTodo.update).not.toHaveBeenCalled();
    expect(prisma.lineAccountLink.update.mock.calls[0][0].data.pendingSnoozeTodoId).toBeNull();
    expect(reply).not.toHaveBeenCalled();
  });

  it('隔太久才打數字，不算回答', async () => {
    const { call, link, prisma } = setup({ pendingSnoozeTodoId: 't1', pendingSnoozeAt: new Date(Date.now() - 31 * 60 * 1000) });
    await expect(call('tryResolveSnooze', link, '30', 'r')).resolves.toBe(false);
    expect(prisma.projectTodo.update).not.toHaveBeenCalled();
  });

  it('取消', async () => {
    const { call, link, prisma, reply } = setup({ pendingSnoozeTodoId: 't1', pendingSnoozeAt: new Date() });
    await expect(call('tryResolveSnooze', link, '取消', 'r')).resolves.toBe(true);
    expect(prisma.projectTodo.update).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it('用選的時間延後；選到過去不收', async () => {
    const { call, link, prisma } = setup({});
    await call('handleTodoPostback', link, 'todo:snooze-at:t1', 'r', '2099-01-02T15:30');
    expect(prisma.projectTodo.update.mock.calls[0][0].data.remindAt).toEqual(new Date('2099-01-02T07:30:00Z'));

    const second = setup({});
    await second.call('handleTodoPostback', second.link, 'todo:snooze-at:t1', 'r', '2001-01-02T15:30');
    expect(second.prisma.projectTodo.update).not.toHaveBeenCalled();
  });

  it('舊訊息上的「10 分鐘後」還能按', async () => {
    const { call, link, prisma } = setup({});
    const before = Date.now();
    await call('handleTodoPostback', link, 'todo:snooze:t1:10', 'r');
    const at = prisma.projectTodo.update.mock.calls[0][0].data.remindAt as Date;
    expect(at.getTime() - before).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});

describe('回覆某一則訊息', () => {

  it('回覆提醒說做完了：直接打勾，不用 AI', async () => {
    const { call, link, todosService } = setup({});
    await expect(call('tryHandleQuotedReminder', link, 't1', '做完了', 'r')).resolves.toBe(true);
    expect(todosService.update).toHaveBeenCalledWith('u1', 't1', { done: true });
  });

  it('回覆提醒打時間：延後那一件', async () => {
    const { call, link, prisma, reply } = setup({});
    await expect(call('tryHandleQuotedReminder', link, 't1', '30分', 'r')).resolves.toBe(true);
    expect(prisma.projectTodo.update.mock.calls[0][0].where).toEqual({ id: 't1' });
    expect(reply.mock.calls[0][1]).toContain('關火');
  });

  it('回覆提醒說延後：先問時間', async () => {
    const { call, link, callReplyApi } = setup({});
    await expect(call('tryHandleQuotedReminder', link, 't1', '延後', 'r')).resolves.toBe(true);
    expect(callReplyApi.mock.calls[0][0].messages[0].text).toContain('要延到什麼時候');
  });

  it('回覆提醒講別的：交給 AI', async () => {
    const { call, link, prisma } = setup({});
    await expect(call('tryHandleQuotedReminder', link, 't1', '這個可以改成每週嗎', 'r')).resolves.toBe(false);
    expect(prisma.projectTodo.update).not.toHaveBeenCalled();
  });

  it('那件代辦已經做完或刪了：交給 AI', async () => {
    const { call, link, prisma } = setup({});
    prisma.projectTodo.findFirst.mockResolvedValue(null);
    await expect(call('tryHandleQuotedReminder', link, 't1', '30分', 'r')).resolves.toBe(false);
  });
});

describe('提醒訊息的按鈕', () => {
  it('做在訊息本身（Flex），不是 quick reply', () => {
    const message = buttonMessage('⏰ 時間到了：關火', [
      { label: '✅ 完成了', data: 'todo:done:t1' },
      { label: '⏰ 延後', data: 'todo:snooze:t1' },
    ]);
    expect(message.type).toBe('flex');
    expect(message).not.toHaveProperty('quickReply');
    expect(message.contents.footer.contents.map((b) => b.action.data)).toEqual(['todo:done:t1', 'todo:snooze:t1']);
    expect(message.contents.footer.contents[0].action.type).toBe('postback');
  });

  it('altText 不超過 LINE 的 400 字', () => {
    expect(buttonMessage('字'.repeat(500), []).altText).toHaveLength(400);
  });
});
