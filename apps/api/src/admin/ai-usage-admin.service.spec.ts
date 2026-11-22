import { AiUsageAdminService, costAlertText, crossedCostLevels } from './ai-usage-admin.service';

function makeService(costs: { model: string; feature: string; costUsd: number }[], already: string[] = []) {
  const logged = new Set(already);
  const prisma = {
    aiUsageLog: {
      findMany: jest.fn().mockResolvedValue(costs.map((c) => ({ ...c, userId: 'u1', status: 'SUCCESS', createdAt: new Date() }))),
    },
    systemAlertLog: {
      createMany: jest.fn(({ data }: { data: { key: string }[] }) => {
        const key = data[0].key;
        const isNew = !logged.has(key);
        logged.add(key);
        return Promise.resolve({ count: isNew ? 1 : 0 });
      }),
    },
  };
  return { service: new AiUsageAdminService(prisma as never, {} as never), logged };
}

describe('AI 費用警告（每月 20／30 美金）', () => {
  it('跨過哪些門檻', () => {
    expect(crossedCostLevels(19.9)).toEqual([]);
    expect(crossedCostLevels(20)).toEqual([20]);
    expect(crossedCostLevels(31)).toEqual([30, 20]);
  });

  it('到 20 美金通知一次，同一個月不重發', async () => {
    const { service } = makeService([
      { model: 'claude-sonnet-5-5', feature: 'line_ai_agent', costUsd: 18 },
      { model: 'gemini-3.6-flash', feature: 'voice', costUsd: 3 },
    ]);
    const text = await service.monthlyCostAlert();
    expect(text).toContain('💰 AI 費用通知');
    expect(text).toContain('Claude $18.00、Gemini $3.00');
    expect(text).toContain('・LINE AI 對話 $18.00');
    expect(await service.monthlyCostAlert()).toBeNull();
  });

  it('一次跨過 30 只發嚴重警告，20 也記下來不會再補發', async () => {
    const { service, logged } = makeService([{ model: 'claude-sonnet-5-5', feature: 'line_ai_agent', costUsd: 32 }]);
    expect(await service.monthlyCostAlert()).toContain('🚨 AI 費用嚴重警告');
    expect([...logged].sort()).toHaveLength(2);
    expect(await service.monthlyCostAlert()).toBeNull();
  });

  it('20 發過了，到 30 再發嚴重警告', async () => {
    const { service, logged } = makeService([{ model: 'claude-sonnet-5-5', feature: 'line_ai_agent', costUsd: 30.5 }]);
    const month = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
    logged.add(`ai-cost:20:${month}`);
    expect(await service.monthlyCostAlert()).toContain('超過 30 美金');
  });

  it('沒到 20 不發', async () => {
    expect(await makeService([{ model: 'claude-sonnet-5-5', feature: 'x', costUsd: 5 }]).service.monthlyCostAlert()).toBeNull();
  });

  it('文字不寫 AI 會停', () => {
    expect(costAlertText(30, { costUsd: 30 }, [], [])).toContain('不會停');
  });
});
