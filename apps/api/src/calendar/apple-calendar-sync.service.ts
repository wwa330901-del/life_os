import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as ical from 'node-ical';
import type { ParameterValue } from 'node-ical';
import { PrismaService } from '../prisma/prisma.service';
import { AppleCalendarService } from './apple-calendar.service';

const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 90;

interface ParsedInstance {
  uid: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
}

/**
 * iCloud → 元序行事曆的單向匯入 (2026-08-11)——只拉取，永遠不會把元序的
 * 行程推回 iCloud（跟 CalendarSyncService 的 Google 雙向同步不同）。每次
 * 同步都用同一個固定的時間窗（過去 7 天～未來 90 天）重新抓一次、整批
 * 比對現存的 CalendarEvent（用 appleEventUid 辨識），窗外的舊事件不去動它
 * ——不是「這次窗口沒看到就當作被刪除」，而是「這次窗口內沒看到的，才當
 * 作被刪除」，避免每次同步窗口本身就會誤刪窗口外還有效的資料。
 *
 * iCloud 的重複行程（RRULE）在這裡就展開成一筆一筆具體事件（見
 * schema.prisma 的 CalendarEvent.appleEventUid 說明），uid 用
 * `${原始UID}::${該次發生的開始時間}` 組成，讓同一個重複規則底下的每一次
 * 發生都能被獨立追蹤增刪。
 */
@Injectable()
export class AppleCalendarSyncService {
  private readonly logger = new Logger(AppleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appleCalendar: AppleCalendarService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAllConnectedSpaces() {
    const connections = await this.prisma.appleCalendarConnection.findMany();
    for (const connection of connections) {
      try {
        await this.syncSpace(connection.spaceId);
      } catch (error) {
        this.logger.warn(`背景同步 iCloud 行事曆（space=${connection.spaceId}）失敗：${error}`);
      }
    }
  }

  async syncSpace(spaceId: string): Promise<void> {
    const connection = await this.prisma.appleCalendarConnection.findUnique({ where: { spaceId } });
    if (!connection) return;

    const now = new Date();
    const rangeStart = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);
    const rangeEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400000);

    const icsBlobs = await this.appleCalendar.fetchEventIcsData(
      connection.appleId,
      connection.appPassword,
      connection.selectedCalendarUrls,
      { start: rangeStart, end: rangeEnd },
    );

    const instances: ParsedInstance[] = [];
    for (const ics of icsBlobs) {
      instances.push(...this.parseIcsIntoInstances(ics, rangeStart, rangeEnd));
    }

    const seenUids = new Set(instances.map((i) => i.uid));
    for (const instance of instances) {
      await this.prisma.calendarEvent.upsert({
        where: { spaceId_appleEventUid: { spaceId, appleEventUid: instance.uid } },
        create: {
          spaceId,
          appleEventUid: instance.uid,
          title: instance.title,
          startAt: instance.startAt,
          endAt: instance.endAt,
          allDay: instance.allDay,
        },
        update: {
          title: instance.title,
          startAt: instance.startAt,
          endAt: instance.endAt,
          allDay: instance.allDay,
        },
      });
    }

    // 這個時間窗內、上次同步有但這次沒再看到的（代表在 iCloud 那邊被刪除
    // 或改到窗外去了）——只刪窗內範圍的，避免動到窗外還有效的舊資料。
    await this.prisma.calendarEvent.deleteMany({
      where: {
        spaceId,
        appleEventUid: { not: null, notIn: [...seenUids] },
        startAt: { gte: rangeStart, lte: rangeEnd },
      },
    });

    await this.prisma.appleCalendarConnection.update({
      where: { spaceId },
      data: { lastSyncedAt: new Date() },
    });
  }

  private parseIcsIntoInstances(ics: string, rangeStart: Date, rangeEnd: Date): ParsedInstance[] {
    let parsed: ical.CalendarResponse;
    try {
      parsed = ical.sync.parseICS(ics);
    } catch (error) {
      this.logger.warn(`解析 iCloud 事件內容失敗，略過這一筆：${error}`);
      return [];
    }

    const result: ParsedInstance[] = [];
    for (const component of Object.values(parsed)) {
      if (!component || component.type !== 'VEVENT') continue;
      const vevent = component;
      if (vevent.status === 'CANCELLED') continue;

      if (vevent.rrule) {
        const expanded = ical.expandRecurringEvent(vevent, { from: rangeStart, to: rangeEnd });
        for (const occurrence of expanded) {
          result.push({
            uid: `${vevent.uid}::${occurrence.start.toISOString()}`,
            title: this.plainText(occurrence.summary) || '（無標題）',
            startAt: occurrence.start,
            endAt: occurrence.end,
            allDay: occurrence.isFullDay,
          });
        }
      } else {
        result.push({
          uid: vevent.uid,
          title: this.plainText(vevent.summary) || '（無標題）',
          startAt: vevent.start,
          endAt: vevent.end ?? null,
          allDay: vevent.datetype === 'date',
        });
      }
    }
    return result;
  }

  /** node-ical 的文字欄位有時是純字串，有時是 `{val, params}`（有帶
   * LANGUAGE 之類的參數時）——統一轉成純字串。 */
  private plainText(value: ParameterValue<string> | undefined): string {
    if (!value) return '';
    return typeof value === 'string' ? value : value.val;
  }
}
