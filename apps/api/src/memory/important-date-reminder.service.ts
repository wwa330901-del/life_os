import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { taipeiDateKey } from '../common/taipei-date';
import { DATE_REMIND_DAYS, describeDate, nextOccurrence } from './important-dates';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 重要日子提醒（2026-10-01）：前 7 天、前 1 天、當天早上 LINE 提醒。 */
@Injectable()
export class ImportantDateReminderService {
  private readonly logger = new Logger(ImportantDateReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async remind(): Promise<void> {
    const today = taipeiDateKey(new Date());
    const dates = await this.prisma.importantDate.findMany();
    for (const d of dates) {
      try {
        const next = nextOccurrence(today, d);
        if (!DATE_REMIND_DAYS.includes(next.daysLeft)) continue;
        const key = `${next.date}:${next.daysLeft}`;
        if (d.lastRemindedKey === key) continue;
        await this.prisma.importantDate.update({ where: { id: d.id }, data: { lastRemindedKey: key } });
        await this.notifier.notifyByUser(d.ownerUserId, reminderText(d, next));
      } catch (error) {
        this.logger.error(`重要日子提醒失敗（${d.title}）`, error);
      }
    }
  }
}

export function reminderText(
  d: { title: string; month: number; day: number; isLunar: boolean; note: string | null },
  next: { date: string; daysLeft: number; years: number | null },
): string {
  const [y, m, dd] = next.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  const when =
    next.daysLeft === 0 ? '今天' : next.daysLeft === 1 ? '明天' : `${next.daysLeft} 天後（${m}/${dd} 星期${weekday}）`;
  const lunar = d.isLunar ? `（${describeDate(d)}）` : '';
  const years = next.years != null && next.years > 0 ? `，${/生日/.test(d.title) ? `滿 ${next.years} 歲` : `第 ${next.years} 週年`}` : '';
  return [
    `🎉 ${when}是「${d.title}」${lunar}${years}`,
    d.note ? `備註：${d.note}` : null,
    next.daysLeft === 0 ? '別忘了說聲祝福 🙂' : '要我幫你想禮物、訂餐廳或排時間，直接跟我說。',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
