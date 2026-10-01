import { decryptSecret } from '../common/secret-box';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createDAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';

const ICLOUD_CALDAV_SERVER = 'https://caldav.icloud.com';

type DAVClientInstance = Awaited<ReturnType<typeof createDAVClient>>;

export interface AppleCalendarObject {
  url: string;
  etag: string | null;
  data: string;
}

export interface AppleCalendarCredentials {
  appleId: string;
  appPassword: string;
}

export interface AppleCalendarSummary {
  url: string;
  displayName: string;
}

/**
 * 低階 CalDAV 存取（2026-08-11）— 只跟 iCloud 講話，不碰 CalendarEvent 資料庫
 * 存取（那是 AppleCalendarSyncService 的事）。iCloud 的帳號驗證用「App 專用
 * 密碼」（appleid.apple.com 產生，不是登入密碼——iCloud 帳號全面強制雙重
 * 驗證，一般密碼沒辦法直接打 CalDAV），走 Basic Auth，同 tsdav 的標準用法。
 *
 * 同事分享給使用者、使用者已經接受的日曆，會直接出現在這個帳號自己的
 * 日曆清單裡（iCloud 在伺服器端處理分享，不需要額外的「訂閱別人日曆」
 * API）——`fetchCalendars` 拿到的清單本來就包含它。
 */
@Injectable()
export class AppleCalendarService {
  private readonly logger = new Logger(AppleCalendarService.name);

  private async createClient(appleId: string, appPassword: string): Promise<DAVClientInstance> {
    try {
      return await createDAVClient({
        serverUrl: ICLOUD_CALDAV_SERVER,
        // Stored encrypted; a freshly typed password (connect/discover) passes through as-is.
        credentials: { username: appleId, password: decryptSecret(appPassword) ?? '' },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
    } catch (error) {
      this.logger.warn(`iCloud CalDAV 連線失敗：${error}`);
      throw new BadRequestException(
        'iCloud 連線失敗，請確認 Apple ID 跟 App 專用密碼是否正確（不是你的一般登入密碼）。',
      );
    }
  }

  /** 驗證帳密可用，並列出這個帳號能看到的所有日曆（含別人分享給他、已接受
   * 的）——不會做任何寫入，純粹讓使用者接下來勾選要同步哪幾個。 */
  async discoverCalendars(appleId: string, appPassword: string): Promise<AppleCalendarSummary[]> {
    const client = await this.createClient(appleId, appPassword);
    const calendars = await client.fetchCalendars();
    return calendars
      .filter((c) => !c.components || c.components.includes('VEVENT'))
      .map((c) => ({
        url: c.url,
        displayName: typeof c.displayName === 'string' && c.displayName ? c.displayName : c.url,
      }));
  }

  /** 抓選定日曆未來一段時間內（含最近過去，避免今天已開始的事件被漏掉）的
   * 所有事件，連同 CalDAV 物件網址跟 etag——之後在元序改/刪這則事件時要
   * 靠這兩個回寫 iCloud（2026-09-30 起 iCloud 改成雙向）。 */
  async fetchEventObjects(
    appleId: string,
    appPassword: string,
    calendarUrls: string[],
    timeRange: { start: Date; end: Date },
  ): Promise<AppleCalendarObject[]> {
    const client = await this.createClient(appleId, appPassword);
    const allCalendars = await client.fetchCalendars();
    const targets = allCalendars.filter((c) => calendarUrls.includes(c.url));

    const result: AppleCalendarObject[] = [];
    for (const calendar of targets) {
      const objects = await client.fetchCalendarObjects({
        calendar: calendar as DAVCalendar,
        timeRange: { start: timeRange.start.toISOString(), end: timeRange.end.toISOString() },
      });
      for (const obj of objects) {
        if (typeof obj.data === 'string' && obj.data.trim()) {
          result.push({ url: obj.url, etag: obj.etag ?? null, data: obj.data });
        }
      }
    }
    return result;
  }

  /** 在指定的 iCloud 日曆新增一則事件，回傳物件網址＋etag。 */
  async createEvent(
    creds: AppleCalendarCredentials,
    calendarUrl: string,
    uid: string,
    iCalString: string,
  ): Promise<{ url: string; etag: string | null }> {
    const client = await this.createClient(creds.appleId, creds.appPassword);
    const calendars = await client.fetchCalendars();
    const calendar = calendars.find((c) => c.url === calendarUrl);
    if (!calendar) throw new Error('找不到要寫入的 iCloud 日曆，請到行事曆設定重新選擇');
    const filename = `${uid}.ics`;
    const res = await client.createCalendarObject({ calendar: calendar as DAVCalendar, iCalString, filename });
    if (!res.ok) throw new Error(`iCloud 新增事件失敗（HTTP ${res.status}）`);
    const base = calendar.url.endsWith('/') ? calendar.url : `${calendar.url}/`;
    return { url: new URL(filename, base).toString(), etag: res.headers.get('etag') };
  }

  async updateEvent(
    creds: AppleCalendarCredentials,
    url: string,
    etag: string | null,
    iCalString: string,
  ): Promise<{ etag: string | null }> {
    const client = await this.createClient(creds.appleId, creds.appPassword);
    const res = await client.updateCalendarObject({
      calendarObject: { url, data: iCalString, ...(etag && { etag }) },
    });
    if (!res.ok) throw new Error(`iCloud 更新事件失敗（HTTP ${res.status}）`);
    return { etag: res.headers.get('etag') };
  }

  async deleteEvent(creds: AppleCalendarCredentials, url: string, etag: string | null): Promise<void> {
    const client = await this.createClient(creds.appleId, creds.appPassword);
    const res = await client.deleteCalendarObject({ calendarObject: { url, ...(etag && { etag }) } });
    // 404＝iCloud 那邊已經刪掉了，目的一樣達到。
    if (!res.ok && res.status !== 404) throw new Error(`iCloud 刪除事件失敗（HTTP ${res.status}）`);
  }
}
