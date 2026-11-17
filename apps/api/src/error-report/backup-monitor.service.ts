import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

const RUNS_URL = 'https://api.github.com/repos/wwa330901-del/life_os/actions/workflows/db-backup.yml/runs?status=success&per_page=1';
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

/** 備份失敗沒人看得到：GitHub 只寄信，排程放著 60 天沒動靜還會被自動停用。
 * 所以每天反過來檢查最後一次成功的時間，太久就用 logger.error 傳 LINE 給管理員。 */
@Injectable()
export class BackupMonitorService {
  private readonly logger = new Logger(BackupMonitorService.name);

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async check(now = new Date()) {
    let lastSuccess: string | undefined;
    try {
      const response = await fetch(RUNS_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'life-os-api' } });
      if (!response.ok) {
        this.logger.warn(`查備份狀態失敗（${response.status}）`);
        return;
      }
      const body = (await response.json()) as { workflow_runs?: { created_at: string }[] };
      lastSuccess = body.workflow_runs?.[0]?.created_at;
    } catch (error) {
      this.logger.warn(`查備份狀態失敗：${String(error)}`);
      return;
    }
    if (lastSuccess && now.getTime() - new Date(lastSuccess).getTime() < MAX_AGE_MS) return;
    this.logger.error(
      lastSuccess
        ? `⚠️ 資料庫備份超過 36 小時沒有成功（最後成功：${lastSuccess}），請到 GitHub Actions 看「Database backup」`
        : '⚠️ 資料庫備份還沒有成功過，請確認 GitHub 的 SUPABASE_DB_URL 和 BACKUP_PASSWORD 有設定',
    );
  }
}
