import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as ical from 'node-ical';
import type { ParameterValue } from 'node-ical';
import { PrismaService } from '../prisma/prisma.service';
import { AppleCalendarService } from './apple-calendar.service';
import { CalendarPushService } from './calendar-push.service';
import { CalendarRecurrenceFrequency, CalendarSyncTarget } from '../../generated/prisma/client.js';

const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 90;

interface ParsedInstance {
  uid: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  /** Only for a plain (non-recurring) event — the CalDAV object to write back to. */
  href: string | null;
  etag: string | null;
}

/**
 * iCloud ↔ 元序行事曆同步。原本 (2026-08-11) 只有 iCloud → 元序的單向匯入；
 * 2026-09-30 起改成雙向：元序新增時選「存到 iPhone」的行程由
 * CalendarPushService 寫進 iCloud，這裡則負責匯入＋重試沒推成功的。每次
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
    private readonly push: CalendarPushService,
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

    // 寫入用的日曆也要一起讀回來，不然元序寫進去的行程在下次同步會被當成「iCloud 刪掉了」。
    const calendarUrls = [
      ...new Set([...connection.selectedCalendarUrls, ...(connection.writeCalendarUrl ? [connection.writeCalendarUrl] : [])]),
    ];
    const objects = await this.appleCalendar.fetchEventObjects(connection.appleId, connection.appPassword, calendarUrls, {
      start: rangeStart,
      end: rangeEnd,
    });

    const instances: ParsedInstance[] = [];
    for (const obj of objects) {
      instances.push(...this.parseIcsIntoInstances(obj.data, rangeStart, rangeEnd, obj.url, obj.etag));
    }

    const seenUids = new Set(instances.map((i) => i.uid));
    for (const instance of instances) {
      await this.prisma.calendarEvent.upsert({
        where: { spaceId_appleEventUid: { spaceId, appleEventUid: instance.uid } },
        create: {
          spaceId,
          appleEventUid: instance.uid,
          syncTarget: CalendarSyncTarget.ICLOUD,
          appleEventHref: instance.href,
          appleEventEtag: instance.etag,
          title: instance.title,
          startAt: instance.startAt,
          endAt: instance.endAt,
          allDay: instance.allDay,
        },
        update: {
          syncTarget: CalendarSyncTarget.ICLOUD,
          appleEventHref: instance.href,
          appleEventEtag: instance.etag,
          title: instance.title,
          startAt: instance.startAt,
          endAt: instance.endAt,
          allDay: instance.allDay,
        },
      });
    }

    // 這個時間窗內、上次同步有但這次沒再看到的（代表在 iCloud 那邊被刪除
    // 或改到窗外去了）——只刪窗內範圍的，避免動到窗外還有效的舊資料。
    // 元序剛新增、還沒成功寫進 iCloud 的（有 syncTarget 但沒有 href）不能刪，
    // 那是「還沒推上去」不是「被刪了」。
    await this.prisma.calendarEvent.deleteMany({
      where: {
        spaceId,
        appleEventUid: { not: null, notIn: [...seenUids] },
        startAt: { gte: rangeStart, lte: rangeEnd },
        OR: [{ appleEventHref: { not: null } }, { syncTarget: null }, { appleEventUid: { contains: '::' } }],
      },
    });

    // 重試：選了存到 iPhone、但還沒寫進 iCloud 的。
    const unpushed = await this.prisma.calendarEvent.findMany({
      where: {
        spaceId,
        syncTarget: CalendarSyncTarget.ICLOUD,
        appleEventHref: null,
        recurrenceFrequency: CalendarRecurrenceFrequency.NONE,
      },
    });
    for (const event of unpushed) {
      await this.push.push(event).catch((error) => {
        this.logger.warn(`重試寫入 iCloud 失敗（event=${event.id}）：${error}`);
      });
    }

    await this.prisma.appleCalendarConnection.update({
      where: { spaceId },
      data: { lastSyncedAt: new Date() },
    });
  }

  private parseIcsIntoInstances(
    ics: string,
    rangeStart: Date,
    rangeEnd: Date,
    href: string | null,
    etag: string | null,
  ): ParsedInstance[] {
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
            href: null,
            etag: null,
          });
        }
      } else {
        result.push({
          uid: vevent.uid,
          title: this.plainText(vevent.summary) || '（無標題）',
          startAt: vevent.start,
          endAt: vevent.end ?? null,
          allDay: vevent.datetype === 'date',
          href,
          etag,
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
