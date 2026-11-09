import { LineMessageLogService, withQuoteContext } from './line-message-log.service';

function setup() {
  const prisma = {
    lineMessage: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, service: new LineMessageLogService(prisma as never) };
}

const ok = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

describe('LineMessageLogService', () => {
  it('用回應的 sentMessages id 記下送出的內容，一一對應', async () => {
    const { service, prisma } = setup();
    await service.recordSent('u1', [{ text: '第一則' }, { altText: '提醒' }], ok({ sentMessages: [{ id: 'm1' }, { id: 'm2' }] }), 't1');
    expect(prisma.lineMessage.createMany.mock.calls[0][0].data).toEqual([
      { id: 'm1', userId: 'u1', fromUser: false, text: '第一則', todoId: 't1' },
      { id: 'm2', userId: 'u1', fromUser: false, text: '提醒', todoId: 't1' },
    ]);
  });

  it('傳送失敗或回應沒有 id 就不記，也不丟錯', async () => {
    const { service, prisma } = setup();
    await service.recordSent('u1', [{ text: 'x' }], { ok: false } as Response);
    await service.recordSent('u1', [{ text: 'x' }], ok({}));
    await service.recordSent('u1', [{ text: 'x' }], { ok: true, json: () => Promise.reject(new Error('bad')) } as unknown as Response);
    expect(prisma.lineMessage.createMany).not.toHaveBeenCalled();
  });

  it('收到的圖片記成說明文字', async () => {
    const { service, prisma } = setup();
    await service.recordReceived('u1', { id: 'm3', type: 'image' });
    expect(prisma.lineMessage.createMany.mock.calls[0][0].data[0]).toMatchObject({ fromUser: true, text: '（一張圖片）' });
  });

  it('只查得到自己的訊息', async () => {
    const { service, prisma } = setup();
    await service.findQuoted('u1', 'm1');
    expect(prisma.lineMessage.findFirst.mock.calls[0][0].where).toEqual({ id: 'm1', userId: 'u1' });
  });

  it('清掉 90 天前的', async () => {
    const { service, prisma } = setup();
    await service.deleteOld(new Date('2026-11-09T00:00:00Z'));
    expect(prisma.lineMessage.deleteMany.mock.calls[0][0].where.createdAt.lt).toEqual(new Date('2026-08-11T00:00:00Z'));
  });
});

describe('withQuoteContext', () => {
  const at = new Date('2026-11-09T02:00:00Z');

  it('分得出是誰傳的，原文和他的話都在', () => {
    const fromBot = withQuoteContext('改成 150', { fromUser: false, text: '記了午餐 120', todoId: null, createdAt: at });
    expect(fromBot).toContain('你之前傳給他的');
    expect(fromBot).toContain('記了午餐 120');
    expect(fromBot.endsWith('改成 150')).toBe(true);
    expect(withQuoteContext('x', { fromUser: true, text: 'y', todoId: null, createdAt: at })).toContain('他自己之前傳的');
  });

  it('查不到原文時要 AI 別猜', () => {
    expect(withQuoteContext('這個呢', null)).toContain('不要猜');
  });
});
