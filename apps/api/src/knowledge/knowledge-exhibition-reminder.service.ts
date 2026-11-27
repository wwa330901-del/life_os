import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { KnowledgeItemStatus } from '../../generated/prisma/client.js';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight, taipeiHour } from '../common/taipei-date';

const DAY_MS = 24 * 60 * 60 * 1000;

export type EventReminderKind = 'start' | 'end14' | 'end3';

/** 這則活動今天該發哪一種提醒（純函式，好測）。
 * start：開展當天到之後 2 天內（伺服器睡著晚一點也補得到）。
 * end14：結束前 4～14 天。end3：結束前 0～3 天。
 * 已經發過的種類不再發；同一次只發最急的那個。 */
export function dueEventReminder(
  todayKey: string,
  startKey: string | null,
  endKey: string | null,
  alreadySent: Set<EventReminderKind>,
): EventReminderKind | null {
  const today = taipeiDateKeyToUtcMidnight(todayKey).getTime();
  const days = (key: string) => Math.round((taipeiDateKeyToUtcMidnight(key).getTime() - today) / DAY_MS);
  const left = endKey ? days(endKey) : null;
  if (left !== null && left < 0) return null;
  if (left !== null && left <= 3) return alreadySent.has('end3') ? null : 'end3';
  if (left !== null && left <= 14) return alreadySent.has('end14') ? null : 'end14';
  if (startKey) {
    const since = -days(startKey);
    if (since >= 0 && since <= 2 && !alreadySent.has('start')) return 'start';
  }
  return null;
}

/** 展覽、活動提醒（2026-11-27 重寫）。原本只在傍晚 6 點看一次、只看「結束前
 * 7 天」、只看「展覽資訊」分類，伺服器睡著就沒發——使用者說展覽結束了才知道。
 * 現在：所有 AI 抓到活動日期的收藏都算；開展、結束前 2 週、結束前 3 天各發一次；
 * 早上 9 點到晚上 9 點每小時檢查，錯過會補。發過的記在 SystemAlertLog
 * （kb-event:<種類>:<收藏 id>），不會重複。按「不去了」就不再提醒。 */
@Injectable()
export class KnowledgeExhibitionReminderService {
  private readonly logger = new Logger(KnowledgeExhibitionReminderService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  async onApplicationBootstrap() {
    setTimeout(() => void this.sendEventReminders(), 90_000);
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'Asia/Taipei' })
  async sendEventReminders() {
    const now = new Date();
    const hour = taipeiHour(now);
    if (hour < 9 || hour > 21 || this.running) return;
    this.running = true;
    try {
      const todayKey = taipeiDateKey(now);
      const today = taipeiDateKeyToUtcMidnight(todayKey);
      const items = await this.prisma.knowledgeItem.findMany({
        where: {
          status: KnowledgeItemStatus.DONE,
          OR: [{ exhibitionDecisionStatus: null }, { exhibitionDecisionStatus: 'PENDING' }],
          AND: [
            { OR: [{ eventEndDate: { gte: today } }, { eventEndDate: null, eventStartDate: { gte: new Date(today.getTime() - 2 * DAY_MS) } }] },
            { OR: [{ eventEndDate: { not: null } }, { eventStartDate: { not: null } }] },
          ],
        },
        select: { id: true, ownerUserId: true, title: true, eventStartDate: true, eventEndDate: true },
      });
      if (!items.length) return;

      const sentRows = await this.prisma.systemAlertLog.findMany({
        where: { key: { in: items.flatMap((i) => ['start', 'end14', 'end3'].map((k) => `kb-event:${k}:${i.id}`)) } },
        select: { key: true },
      });
      const sent = new Set(sentRows.map((r) => r.key));

      for (const item of items) {
        const startKey = item.eventStartDate?.toISOString().slice(0, 10) ?? null;
        const endKey = item.eventEndDate?.toISOString().slice(0, 10) ?? null;
        const already = new Set(
          (['start', 'end14', 'end3'] as const).filter((k) => sent.has(`kb-event:${k}:${item.id}`)),
        );
        const kind = dueEventReminder(todayKey, startKey, endKey, already);
        if (!kind) continue;
        try {
          // 先記「發過了」再發，兩個排程同時跑也只會發一次。
          await this.prisma.systemAlertLog.create({ data: { key: `kb-event:${kind}:${item.id}` } });
        } catch {
          continue;
        }
        try {
          await this.lineNotifier.notifyByUser(item.ownerUserId, this.message(kind, item.title, todayKey, endKey), [
            { label: '我要去，排時間', data: `kb:plan:${item.id}` },
            { label: '不去了，別再提醒', data: `kb:skip:${item.id}` },
          ]);
        } catch (error) {
          this.logger.error(`活動提醒發送失敗 item=${item.id}`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private message(kind: EventReminderKind, title: string | null, todayKey: string, endKey: string | null): string {
    const name = `「${title ?? '未命名活動'}」`;
    const md = (key: string) => key.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
    const left = endKey
      ? Math.round((taipeiDateKeyToUtcMidnight(endKey).getTime() - taipeiDateKeyToUtcMidnight(todayKey).getTime()) / DAY_MS)
      : null;
    if (kind === 'start') return `📅 ${name}開始了${endKey ? `，${md(endKey)} 結束` : ''}，你之前存在大腦裡。`;
    if (left === 0) return `⏰ ${name}今天是最後一天！`;
    return `${kind === 'end3' ? '⏰' : '📅'} ${name}還剩 ${left} 天就結束了（${md(endKey!)}），要不要排時間去？`;
  }
}
