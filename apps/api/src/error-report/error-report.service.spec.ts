import { ErrorReportService } from './error-report.service';
import { ReportingLogger } from './reporting-logger';

function make() {
  const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin' }]) } };
  const lineNotifier = { notifyByUser: jest.fn().mockResolvedValue(undefined) };
  return { service: new ErrorReportService(prisma as never, lineNotifier as never), lineNotifier };
}

const T = new Date('2026-10-01T04:00:00Z');
const later = (minutes: number) => new Date(T.getTime() + minutes * 60_000);

describe('ErrorReportService', () => {
  it('sends the admin a Chinese LINE message, once an hour per error (ids ignored)', async () => {
    const { service, lineNotifier } = make();
    expect(await service.report('DailyBriefService', '每日早報失敗（userId=3f2b9c1e-1111-2222-3333-444455556666）', 'Error: boom\n    at x', T)).toBe(true);
    const [userId, text] = lineNotifier.notifyByUser.mock.calls[0] as [string, string];
    expect(userId).toBe('admin');
    expect(text).toContain('⚠️ 元序系統出錯了');
    expect(text).toContain('哪裡：DailyBriefService');
    expect(text).toContain('時間：10/1 12:00');
    expect(await service.report('DailyBriefService', '每日早報失敗（userId=9a9a9a9a-1111-2222-3333-444455556666）', undefined, later(10))).toBe(false);
    expect(await service.report('DailyBriefService', '每日早報失敗（userId=9a9a9a9a-1111-2222-3333-444455556666）', undefined, later(61))).toBe(true);
    expect(await service.report('Other', '別的錯', undefined, later(11))).toBe(true);
  });

  it('never reports the LINE notifier’s own failures (would loop) and caps per day', async () => {
    const { service } = make();
    expect(await service.report('LineNotifierService', 'Failed to send LINE push', undefined, T)).toBe(false);
    for (let i = 0; i < 20; i++) await service.report('S', `錯誤種類 ${String.fromCharCode(65 + i)}`, undefined, T);
    expect(await service.report('S', '第 21 種', undefined, T)).toBe(false);
  });

  it('is fed by logger.error with context and the Error', () => {
    const reporter = { report: jest.fn().mockResolvedValue(true) };
    const logger = new ReportingLogger(reporter as never);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.error('淨資產快照失敗', new Error('db down'), 'FinanceReportService');
    expect(reporter.report).toHaveBeenCalledWith('FinanceReportService', '淨資產快照失敗', expect.stringContaining('db down'));
  });
});
