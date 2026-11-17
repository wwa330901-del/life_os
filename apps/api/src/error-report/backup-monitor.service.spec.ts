import { BackupMonitorService } from './backup-monitor.service';

const now = new Date('2026-11-10T01:00:00Z');

function run(response: unknown) {
  global.fetch = jest.fn().mockResolvedValue(response) as never;
  const service = new BackupMonitorService();
  const error = jest.spyOn(service['logger'], 'error').mockImplementation();
  jest.spyOn(service['logger'], 'warn').mockImplementation();
  return { service, error };
}
const ok = (runs: { created_at: string }[]) => ({ ok: true, json: () => Promise.resolve({ workflow_runs: runs }) });

describe('BackupMonitorService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('最近有成功：不吵', async () => {
    const { service, error } = run(ok([{ created_at: '2026-11-09T18:30:00Z' }]));
    await service.check(now);
    expect(error).not.toHaveBeenCalled();
  });

  it('超過 36 小時沒成功：通知', async () => {
    const { service, error } = run(ok([{ created_at: '2026-11-08T00:00:00Z' }]));
    await service.check(now);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('從來沒成功過：通知', async () => {
    const { service, error } = run(ok([]));
    await service.check(now);
    expect(error.mock.calls[0][0]).toContain('還沒有成功過');
  });

  it('GitHub 自己查不到：不誤報', async () => {
    const { service, error } = run({ ok: false, status: 503 });
    await service.check(now);
    expect(error).not.toHaveBeenCalled();
  });
});
