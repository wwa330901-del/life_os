import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { KnowledgeItemStatus } from '../../generated/prisma/client.js';

const REMINDER_WINDOW_DAYS = 7;

/** Every evening, checks every 展覽資訊 item (across every user) whose
 * 結束日期 is within a week and who hasn't marked 是否已觀展, and asks via
 * LINE whether to schedule a visit. Deliberately re-asks on every run while
 * unanswered (`exhibitionDecisionStatus` still null) rather than tracking a
 * separate "already asked" flag — same "re-fire until acted on" bias this
 * app already uses for budget-overspend alerts. Only ever one open
 * question per user at a time (skips a user who already has a pending
 * exhibition decision) so a reply is never ambiguous about which
 * exhibition it's answering. */
@Injectable()
export class KnowledgeExhibitionReminderService {
  private readonly logger = new Logger(KnowledgeExhibitionReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6PM, { timeZone: 'Asia/Taipei' })
  async sendEndingSoonReminders() {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const candidates = await this.prisma.knowledgeItem.findMany({
      where: {
        status: KnowledgeItemStatus.DONE,
        exhibitionDecisionStatus: null,
        category: { name: '展覽資訊' },
        fieldValues: {
          some: {
            definition: { name: '結束日期' },
            dateValue: { gte: now, lte: windowEnd },
          },
        },
      },
      include: { fieldValues: { include: { definition: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const dueByOwner = new Map<
      string,
      { itemId: string; title: string; endDate: Date }
    >();
    for (const item of candidates) {
      const visited = item.fieldValues.find(
        (v) => v.definition.name === '是否已觀展',
      )?.booleanValue;
      if (visited === true) continue;
      const endDate = item.fieldValues.find(
        (v) => v.definition.name === '結束日期',
      )?.dateValue;
      if (!endDate) continue;

      // Only the soonest-ending one per owner, so a user is never asked
      // about two exhibitions at once.
      const existing = dueByOwner.get(item.ownerUserId);
      if (!existing || endDate < existing.endDate) {
        dueByOwner.set(item.ownerUserId, {
          itemId: item.id,
          title: item.title ?? '未命名展覽',
          endDate,
        });
      }
    }

    for (const [ownerUserId, due] of dueByOwner) {
      try {
        await this.notifyOwner(ownerUserId, due);
      } catch (error) {
        this.logger.error(`展覽提醒通知失敗（userId=${ownerUserId}）`, error);
      }
    }
  }

  private async notifyOwner(
    ownerUserId: string,
    due: { itemId: string; title: string; endDate: Date },
  ) {
    const link = await this.prisma.lineAccountLink.findUnique({
      where: { userId: ownerUserId },
    });
    if (!link?.lineUserId) return;
    // Already has an unrelated open exhibition question — don't pile on.
    if (
      link.pendingExhibitionScheduleItemId &&
      link.pendingExhibitionScheduleItemId !== due.itemId
    )
      return;

    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingExhibitionScheduleItemId: due.itemId },
    });

    const daysLeft = Math.max(
      0,
      Math.ceil((due.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    await this.lineNotifier.notifyByUser(
      ownerUserId,
      `📅 展覽「${due.title}」還剩 ${daysLeft} 天就結束了，是否要安排觀展？\n回覆「安排」或「不安排」。`,
    );
  }
}
