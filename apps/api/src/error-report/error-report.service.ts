import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { formatTaipeiDateTime } from '../common/taipei-date';

const SAME_ERROR_COOLDOWN_MS = 60 * 60 * 1000;
const DAILY_LIMIT = 20;
/** These log their own push failures — reporting them would loop. */
const IGNORED_CONTEXTS = new Set(['LineNotifierService', 'ErrorReportService']);

/** 錯誤自動通報（2026-10-01）：伺服器出錯（排程失敗、500、App 閃退）時用 LINE 傳中文通知給
 * 平台管理員。同一個錯誤一小時只傳一次、一天最多 20 則，避免洗版。Sentry 有設 DSN 的話照樣會收到。 */
@Injectable()
export class ErrorReportService {
  private readonly lastSent = new Map<string, number>();
  private sentToday = 0;
  private day = '';
  private sending = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  /** Never throws. */
  async report(source: string, message: string, detail?: string, now = new Date()): Promise<boolean> {
    if (this.sending || IGNORED_CONTEXTS.has(source)) return false;
    // 「失敗（userId=…）」for different ids is still the same error.
    const key = `${source}|${message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').replace(/\d+/g, '#').slice(0, 120)}`;
    const last = this.lastSent.get(key);
    if (last != null && now.getTime() - last < SAME_ERROR_COOLDOWN_MS) return false;
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.sentToday = 0;
    }
    if (this.sentToday >= DAILY_LIMIT) return false;
    this.lastSent.set(key, now.getTime());
    this.sentToday++;

    this.sending = true;
    try {
      const admins = await this.prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { id: true } });
      const text = [
        '⚠️ 元序系統出錯了',
        `時間：${formatTaipeiDateTime(now, false)}`,
        `哪裡：${source}`,
        `訊息：${message.slice(0, 300)}`,
        ...(detail ? ['', detail.split('\n').slice(0, 4).join('\n').slice(0, 400)] : []),
        '',
        '（同一個錯誤一小時只通知一次。可以把這則訊息轉給 Claude 幫你修）',
      ].join('\n');
      for (const admin of admins) await this.lineNotifier.notifyByUser(admin.id, text);
      return admins.length > 0;
    } catch {
      return false;
    } finally {
      this.sending = false;
    }
  }
}
