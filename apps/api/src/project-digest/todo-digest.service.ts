import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HomeService } from '../home/home.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';

/** Twice-daily LINE reminder of today's due, not-yet-done 代辦事項 across a
 * user's projects — deliberately todo-only, never mixes in 工期表 schedule
 * info (that's `ProjectDigestService`'s separate 8pm delayed-item digest).
 * Unlike that digest, this one always sends, even with an empty list —
 * the user explicitly wants confirmation the system is still running. */
@Injectable()
export class TodoDigestService {
  private readonly logger = new Logger(TodoDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly homeService: HomeService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: 'Asia/Taipei' })
  async sendMorningDigest() {
    await this.broadcast('☀️ 今日代辦事項', '今天沒有代辦事項。');
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM, { timeZone: 'Asia/Taipei' })
  async sendEveningDigest() {
    await this.broadcast('🌙 今日代辦事項（尚未完成）', '今天的代辦事項都完成了！');
  }

  private async broadcast(title: string, emptyText: string) {
    const links = await this.prisma.lineAccountLink.findMany({ where: { lineUserId: { not: null } } });

    for (const link of links) {
      try {
        await this.notifyUser(link.userId, title, emptyText);
      } catch (error) {
        this.logger.error(`代辦事項提醒通知失敗（userId=${link.userId}）`, error);
      }
    }
  }

  private async notifyUser(userId: string, title: string, emptyText: string) {
    const { dueTodayIncomplete } = await this.homeService.getTodosToday(userId);

    const text =
      dueTodayIncomplete.length === 0
        ? [title, '', emptyText].join('\n')
        : [
            title,
            '',
            ...dueTodayIncomplete.map((t) => `・${t.title}（${t.projectName}）`),
          ].join('\n');

    await this.lineNotifier.notifyByUser(userId, text);
  }
}
