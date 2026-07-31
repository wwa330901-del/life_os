import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HomeService } from '../home/home.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';

/** Every evening, tells each LINE-linked user which of today's planned
 * work items across their projects still have no matching actual record —
 * the same "可能落後" signal the home dashboard's 專案總表 widget shows
 * passively, just pushed proactively so it's seen without opening the app.
 * Users with nothing delayed get no message (silence, not a "you're all
 * caught up!" ping — matches this app's existing bias toward not
 * cluttering LINE with routine-good-news noise). */
@Injectable()
export class ProjectDigestService {
  private readonly logger = new Logger(ProjectDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly homeService: HomeService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8PM, { timeZone: 'Asia/Taipei' })
  async sendDelayedItemsDigest() {
    const links = await this.prisma.lineAccountLink.findMany({ where: { lineUserId: { not: null } } });

    for (const link of links) {
      try {
        await this.notifyUser(link.userId);
      } catch (error) {
        this.logger.error(`專案進度傍晚彙整通知失敗（userId=${link.userId}）`, error);
      }
    }
  }

  private async notifyUser(userId: string) {
    const projects = await this.homeService.getProjectSummary(userId);

    const lines: string[] = [];
    for (const p of projects) {
      const delayed = p.plannedToday.filter(
        (item) => !p.actualToday.some((a) => a.id === item.id),
      );
      if (delayed.length === 0) continue;
      lines.push(`「${p.projectName}」（${p.spaceName}）：`);
      lines.push(...delayed.map((item) => `　・${item.name}`));
    }
    if (lines.length === 0) return;

    await this.lineNotifier.notifyByUser(
      userId,
      ['📋 今日工項進度提醒', '以下項目今天有排程，但還沒有實際紀錄：', '', ...lines].join('\n'),
    );
  }
}
