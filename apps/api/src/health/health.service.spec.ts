import { HealthRecordType } from '../../generated/prisma/client.js';
import { HealthService } from './health.service';

type Row = Record<string, any>;

/** Just enough of prisma.healthRecord for ingest(). */
function fakePrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const matches = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v === null) return r[k] == null;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('not' in v) return r[k] !== v.not;
        if ('gte' in v || 'lte' in v) return (!v.gte || r[k] >= v.gte) && (!v.lte || r[k] <= v.lte);
      }
      return r[k] === v;
    });
  return {
    rows,
    user: { findUnique: jest.fn(({ where }) => Promise.resolve(where.healthIngestToken === 'k' ? { id: 'u1' } : null)) },
    healthRecord: {
      create: jest.fn(({ data }) => {
        const row = { id: `r${++seq}`, minutes: null, endAt: null, externalKey: null, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }) => Promise.resolve(Object.assign(rows.find((r) => r.id === where.id)!, data))),
      upsert: jest.fn(({ where, create, update }) => {
        const key = where.ownerUserId_externalKey;
        const existing = rows.find((r) => r.ownerUserId === key.ownerUserId && r.externalKey === key.externalKey);
        if (existing) return Promise.resolve(Object.assign(existing, update));
        const row = { id: `r${++seq}`, ...create };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }) => {
        const { ownerUserId, type, endAt, startAt, minutes } = where;
        const found = rows
          .filter((r) => matches(r, { ownerUserId, type, endAt, minutes }) && r.startAt && matches(r, { startAt }))
          .sort((a, b) => b.startAt - a.startAt)[0];
        return Promise.resolve(found ?? null);
      }),
      delete: jest.fn(({ where }) => {
        rows.splice(rows.findIndex((r) => r.id === where.id), 1);
        return Promise.resolve({});
      }),
      deleteMany: jest.fn(({ where }) => {
        const { startAt, ...rest } = where;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], rest) && (!startAt || (rows[i].startAt && rows[i].startAt < startAt.lt))) rows.splice(i, 1);
        }
        return Promise.resolve({});
      }),
    },
  };
}

describe('HealthService.ingest', () => {
  it('rejects a wrong key', async () => {
    await expect(new HealthService(fakePrisma() as never).ingest('nope', {})).rejects.toThrow('金鑰不對');
  });

  it('pairs 睡覺 and 起床 events into one night dated the wake day', async () => {
    const prisma = fakePrisma();
    const service = new HealthService(prisma as never);
    await service.ingest('k', { event: 'sleep' }, new Date('2026-09-30T15:40:00Z')); // 23:40 Taipei
    const res = await service.ingest('k', { event: 'wake' }, new Date('2026-09-30T22:55:00Z')); // 06:55
    expect(res.message).toBe('早安！昨晚睡了 7 小時 15 分');
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({ type: HealthRecordType.SLEEP, minutes: 435, externalKey: 'shortcut:sleep:2026-10-01' });
    expect(prisma.rows[0].date.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('treats 起床 right after 睡覺 as a test and drops a stale 睡覺', async () => {
    const prisma = fakePrisma();
    const service = new HealthService(prisma as never);
    await service.ingest('k', { event: 'sleep' }, new Date('2026-09-28T15:00:00Z'));
    await service.ingest('k', { event: 'sleep' }, new Date('2026-09-30T15:00:00Z'));
    expect(prisma.rows).toHaveLength(1); // the 9/28 one never woke up → removed
    const res = await service.ingest('k', { event: 'wake' }, new Date('2026-09-30T15:02:00Z'));
    expect(res.message).toContain('測試成功');
    expect(prisma.rows).toHaveLength(0);
  });

  it('says so when 起床 has no matching 睡覺', async () => {
    const res = await new HealthService(fakePrisma() as never).ingest('k', { event: 'wake' }, new Date('2026-09-30T22:55:00Z'));
    expect(res.message).toContain('沒找到昨晚的睡覺時間');
  });

  it('records 健康 App samples, steps and weight, and a re-upload overwrites', async () => {
    const prisma = fakePrisma();
    const service = new HealthService(prisma as never);
    const body = {
      sleepStart: '2026/9/30 下午11:30\n2026/10/1 上午3:00',
      sleepEnd: '2026/10/1 上午3:00\n2026/10/1 上午6:30',
      steps: '8,532',
      weight: 70.24,
    };
    const res = await service.ingest('k', body, new Date('2026-10-01T12:00:00Z'));
    expect(res.message).toBe('已記錄：睡眠 7 小時、步數 8,532、體重 70.2 公斤');
    await service.ingest('k', { ...body, steps: 9000 }, new Date('2026-10-01T13:00:00Z'));
    expect(prisma.rows).toHaveLength(3);
    expect(prisma.rows.find((r) => r.type === HealthRecordType.STEPS)!.value).toBe(9000);
  });

  it('tells the 捷徑 when nothing usable came in', async () => {
    const res = await new HealthService(fakePrisma() as never).ingest('k', { foo: 1 });
    expect(res.message).toContain('沒有收到可以記錄的資料');
  });
});
