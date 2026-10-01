import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { LifeGoal, LifeGoalStatus, LifeGoalTrackingType } from '../../generated/prisma/client.js';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { LifeGoalProgressService, LifeGoalWithProgress } from './life-goal-progress.service';
import { goalProgressFraction } from './life-goal-math';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEADLINE_REMINDER_DAYS = [7, 1];
const STALE_DAYS = 14;

export function formatGoalProgress(goal: LifeGoalWithProgress): string {
  const fraction = goalProgressFraction(goal);
  if (fraction == null || goal.targetValue == null || goal.currentValue == null) return '';
  const percent = Math.floor(fraction * 100);
  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  return `${percent}%（${fmt(goal.currentValue)}/${fmt(goal.targetValue)}${goal.unit ?? ''}）`;
}

/** Per the user's choice (2026-09-30: 「只提醒快到期的」), no periodic
 * progress report — only two kinds of LINE nudge, folded into one message
 * per user per morning:
 * - deadline in exactly 7 or 1 day(s) — exact-day match, so each fires once
 *   without needing an "already sent" flag;
 * - a MANUAL goal whose number hasn't moved in 14 days — the only type that
 *   can go stale, every other type updates itself. `staleRemindedAt`
 *   throttles it to once per 14 days, and resets whenever progress moves. */
@Injectable()
export class LifeGoalReminderService {
  private readonly logger = new Logger(LifeGoalReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: LifeGoalProgressService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Taipei' })
  async sendReminders() {
    const now = new Date();
    const today = taipeiDateKeyToUtcMidnight(taipeiDateKey(now));
    const deadlineDates = DEADLINE_REMINDER_DAYS.map((d) => new Date(today.getTime() + d * MS_PER_DAY));
    const staleBefore = new Date(now.getTime() - STALE_DAYS * MS_PER_DAY);

    const candidates = await this.prisma.lifeGoal.findMany({
      where: {
        status: LifeGoalStatus.ACTIVE,
        owner: { lineAccountLink: { is: { goalReminderEnabled: true } } },
        OR: [
          { targetDate: { in: deadlineDates } },
          {
            trackingType: LifeGoalTrackingType.MANUAL,
            targetValue: { not: null },
            OR: [{ progressUpdatedAt: { lt: staleBefore } }, { progressUpdatedAt: null, createdAt: { lt: staleBefore } }],
            AND: [{ OR: [{ staleRemindedAt: null }, { staleRemindedAt: { lt: staleBefore } }] }],
          },
        ],
      },
      orderBy: { targetDate: 'asc' },
    });

    const byOwner = new Map<string, LifeGoal[]>();
    for (const goal of candidates) {
      byOwner.set(goal.ownerUserId, [...(byOwner.get(goal.ownerUserId) ?? []), goal]);
    }

    for (const [ownerUserId, goals] of byOwner) {
      try {
        await this.notifyOwner(ownerUserId, goals, today);
      } catch (error) {
        this.logger.error(`人生目標提醒失敗（userId=${ownerUserId}）`, error as Error);
      }
    }
  }

  private async notifyOwner(ownerUserId: string, goals: LifeGoal[], today: Date) {
    const resolved = await this.progress.resolve(ownerUserId, goals);
    const deadlineLines: string[] = [];
    const staleLines: string[] = [];
    const staleIds: string[] = [];

    for (const goal of resolved) {
      const progress = formatGoalProgress(goal);
      if (goal.targetDate) {
        const daysLeft = Math.round((goal.targetDate.getTime() - today.getTime()) / MS_PER_DAY);
        if (DEADLINE_REMINDER_DAYS.includes(daysLeft)) {
          const label = daysLeft === 1 ? '明天到期' : `還剩 ${daysLeft} 天`;
          deadlineLines.push(`・${goal.title}　${label}${progress ? `\n　目前 ${progress}` : ''}`);
          continue;
        }
      }
      staleLines.push(`・${goal.title}　目前記錄 ${progress}`);
      staleIds.push(goal.id);
    }

    const sections: string[] = [];
    if (deadlineLines.length > 0) sections.push(['⏰ 人生目標快到期了', ...deadlineLines].join('\n'));
    if (staleLines.length > 0) {
      sections.push(
        [
          `📝 這些目標 ${STALE_DAYS} 天沒更新了，現在進度是多少？`,
          ...staleLines,
          '直接跟我說就好，例如「體重現在 72」',
        ].join('\n'),
      );
    }
    if (sections.length === 0) return;

    await this.lineNotifier.notifyByUser(ownerUserId, sections.join('\n\n'));
    if (staleIds.length > 0) {
      await this.prisma.lifeGoal.updateMany({ where: { id: { in: staleIds } }, data: { staleRemindedAt: new Date() } });
    }
  }
}
