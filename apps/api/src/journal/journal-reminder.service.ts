import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';

export const JOURNAL_PROMPT_WINDOW_MS = 3 * 60 * 60 * 1000;

const PROMPT_TEXT = [
  '📝 今天過得怎樣？',
  '直接回我幾句就好，我幫你記成日記。',
  '（不想每天收到就傳「關閉日記提醒」）',
].join('\n');

/** 每晚 21:30：今天還沒寫日記、沒關提醒、而且有設 AI 金鑰（不然回覆沒辦法
 * 被記成日記）的人問一句。記下 `journalPromptAt`，之後 3 小時內的回覆由
 * LINE 萬用 AI 優先處理、記成日記。 */
@Injectable()
export class JournalReminderService {
  private readonly logger = new Logger(JournalReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron('30 21 * * *', { timeZone: 'Asia/Taipei' })
  async sendPrompts() {
    const today = taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date()));
    const links = await this.prisma.lineAccountLink.findMany({
      where: {
        lineUserId: { not: null },
        journalReminderEnabled: true,
        user: { geminiApiKey: { not: null }, journalEntries: { none: { date: today } } },
      },
      select: { id: true, userId: true },
    });
    for (const link of links) {
      try {
        await this.lineNotifier.notifyByUser(link.userId, PROMPT_TEXT);
        await this.prisma.lineAccountLink.update({ where: { id: link.id }, data: { journalPromptAt: new Date() } });
      } catch (error) {
        this.logger.error(`日記提醒失敗（userId=${link.userId}）`, error as Error);
      }
    }
  }
}
