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

  /** Grouped by 個人/each project (個人 first), continuously numbered across
   * every group — and that numbering is written to `lastTodoListIds` so
   * "完成 N"/"改期 N" work directly off this push, without the user having
   * to separately open "代辦事項" or switch project context first
   * (2026-08-04 explicit user ask: "不要再切換專案了，要就一次"). */
  private async notifyUser(userId: string, title: string, emptyText: string) {
    const { dueTodayIncomplete } = await this.homeService.getTodosToday(userId);

    if (dueTodayIncomplete.length === 0) {
      await this.lineNotifier.notifyByUser(userId, [title, '', emptyText].join('\n'));
      return;
    }

    const groups = new Map<string, { id: string; title: string }[]>();
    for (const t of dueTodayIncomplete) {
      const list = groups.get(t.projectName) ?? [];
      list.push({ id: t.id, title: t.title });
      groups.set(t.projectName, list);
    }
    const orderedGroupNames = [
      ...(groups.has('個人') ? ['個人'] : []),
      ...[...groups.keys()].filter((name) => name !== '個人'),
    ];

    const lines: string[] = [title, ''];
    const orderedIds: string[] = [];
    let n = 0;
    for (const groupName of orderedGroupNames) {
      lines.push(groupName === '個人' ? '個人代辦：' : `${groupName}：`);
      for (const item of groups.get(groupName)!) {
        n += 1;
        orderedIds.push(item.id);
        lines.push(`${n}. ${item.title}`);
      }
      lines.push('');
    }
    lines.push('傳「完成 編號」標記完成，或「改期 編號 新日期」改期。');

    await this.prisma.lineAccountLink.update({
      where: { userId },
      data: { lastTodoListIds: orderedIds },
    });
    await this.lineNotifier.notifyByUser(userId, lines.join('\n'));
  }
}
