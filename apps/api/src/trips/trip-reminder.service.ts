import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { getDailyForecast } from '../ai-agent/weather';
import { taipeiDateKey, utcDateKey } from '../common/taipei-date';
import { TripsService } from './trips.service';
import { addDays, daysBetween, dueReminder, packingText, TripReminderKind } from './trip';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

/** 旅行提醒（2026-10-02）：每天 09:00——出發前 7 天（行李、天氣、預算）、前 1 天（還沒帶的、
 * 天氣）、回來隔天（實際花多少 vs 預估）。LINE「關閉旅行提醒」或 App 提醒設定可關。 */
@Injectable()
export class TripReminderService {
  private readonly logger = new Logger(TripReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: LineNotifierService,
    private readonly trips: TripsService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Taipei' })
  async run(): Promise<void> {
    const today = taipeiDateKey(new Date());
    const candidates = await this.prisma.trip.findMany({
      where: {
        // 7 天後出發 ～ 昨天回來
        startDate: { lte: new Date(`${addDays(today, 7)}T00:00:00Z`) },
        endDate: { gte: new Date(`${addDays(today, -1)}T00:00:00Z`) },
        user: { lineAccountLink: { lineUserId: { not: null }, tripReminderEnabled: true } },
      },
    });
    for (const trip of candidates) {
      const kind = dueReminder(today, utcDateKey(trip.startDate), utcDateKey(trip.endDate), trip.remindersSent);
      if (!kind) continue;
      try {
        // 先記已發，失敗頂多少一則，不會重複轟炸。
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { remindersSent: [trip.remindersSent, kind].filter(Boolean).join(',') },
        });
        await this.notifier.notifyByUser(trip.userId, await this.text(trip.userId, trip.id, kind, today));
      } catch (error) {
        this.logger.error(`旅行提醒失敗（tripId=${trip.id}）`, error);
      }
    }
  }

  async text(userId: string, tripId: string, kind: TripReminderKind, today: string): Promise<string> {
    const t = await this.trips.get(userId, tripId);
    if (kind === 'after') {
      const lines = [`🧳 ${t.destination}玩得開心嗎？`];
      if (t.spent != null) {
        lines.push('', `旅行期間記帳的支出：${fmt(t.spent)} 元${t.budgetTotal ? `（預估 ${fmt(t.budgetTotal)}，${t.spent > t.budgetTotal ? `超出 ${fmt(t.spent - t.budgetTotal)}` : `省了 ${fmt(t.budgetTotal - t.spent)}`}）` : ''}`);
        if (t.spentByCategory.length) lines.push(t.spentByCategory.slice(0, 4).map((c) => `${c.name} ${fmt(c.total)}`).join('・'));
      }
      lines.push('', '還有沒記到的花費直接跟我說；想記下這趟的回憶，跟我說說最喜歡哪裡，我幫你寫進日記。');
      return lines.join('\n');
    }

    const lines = [
      kind === '7d'
        ? `✈️ 再 7 天就要去${t.destination}了（${md(t.startDate)} 出發，${t.days} 天）`
        : `✈️ 明天就要出發去${t.destination}了！`,
    ];
    const packing = packingText(t.packingList);
    if (packing) lines.push('', `🎒 ${packing}`);
    if (t.latitude != null && t.longitude != null && daysBetween(today, t.startDate) <= 15) {
      try {
        const end = daysBetween(today, t.endDate) > 15 ? addDays(today, 15) : t.endDate;
        const days = await getDailyForecast(t.latitude, t.longitude, t.startDate, end);
        if (days.length) {
          lines.push('', '🌤 當地天氣');
          for (const d of days) lines.push(`${md(d.date)} ${d.weather} ${Math.round(d.low)}～${Math.round(d.high)}°C${d.rainChance != null && d.rainChance >= 30 ? ` 降雨 ${d.rainChance}%` : ''}`);
        }
      } catch {
        // 天氣拿不到就不放，提醒照發。
      }
    }
    if (kind === '7d' && t.budgetTotal) lines.push('', `💰 預估花費 ${fmt(t.budgetTotal)} 元`);
    if (kind === '1d' && t.itinerary[0]?.items.length) {
      lines.push('', `第一天：${t.itinerary[0].items.map((i) => `${i.time ? `${i.time} ` : ''}${i.title}`).join(' → ')}`);
    }
    lines.push('', kind === '1d' ? '帶好了跟我說「護照帶了」我幫你打勾，一路順風 🙌' : '行李準備好了可以跟我說「護照、充電器帶了」我幫你打勾。');
    return lines.join('\n');
  }
}
