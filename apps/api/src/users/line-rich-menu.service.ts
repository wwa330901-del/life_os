import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BOOT_DELAY_MS = 60_000;
const RETRY_DELAYS_MS = [5_000, 30_000];

/** LINE 圖文選單別名：tools/line-richmenu/upload-themes.js 每套外觀風格上傳一份，別名 theme-{id}。 */
export function themeMenuAlias(appTheme: string | null | undefined): string {
  return `theme-${appTheme || 'dawn'}`;
}

/**
 * 讓每個人的 LINE 圖文選單跟他在 App 選的外觀風格一致。
 * 換風格、綁定 LINE 時呼叫；啟動時也全部對一次（補上傳選單前就選好風格的人）。
 * 失敗用 logger.error（錯誤通報只發給管理員）：選單不影響功能，但沒換到要知道原因。
 */
@Injectable()
export class LineRichMenuService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LineRichMenuService.name);
  private readonly token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!this.token) return;
    // 剛啟動時對外連線偶爾還沒好（2026-10-05 Render 上 fetch failed），等一下再做
    setTimeout(() => {
      this.syncAll().catch((err: Error) => this.logger.error(`LINE 選單啟動同步失敗：${err.message}`));
    }, BOOT_DELAY_MS).unref();
  }

  async syncAll(): Promise<void> {
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null } },
      select: { lineUserId: true, user: { select: { appTheme: true } } },
    });
    for (const link of links) await this.apply(link.lineUserId!, link.user.appTheme);
  }

  /** 回傳換成哪一套；沒綁 LINE 回 null。 */
  async applyForUser(userId: string): Promise<string | null> {
    const link = await this.prisma.lineAccountLink.findUnique({
      where: { userId },
      select: { lineUserId: true, user: { select: { appTheme: true } } },
    });
    if (!link?.lineUserId) return null;
    await this.apply(link.lineUserId, link.user.appTheme);
    return themeMenuAlias(link.user.appTheme);
  }

  private async apply(lineUserId: string, appTheme: string | null): Promise<void> {
    if (!this.token) return;
    const alias = themeMenuAlias(appTheme);
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.call(`https://api.line.me/v2/bot/richmenu/alias/${alias}`);
        const { richMenuId } = (await res.json()) as { richMenuId: string };
        await this.call(`https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`, 'POST');
        return;
      } catch (err) {
        // 連線層的錯（fetch failed）重試；LINE 回的錯誤（4xx）重試也沒用
        if (!(err instanceof LineApiError) && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        const cause = (err as Error & { cause?: Error }).cause?.message;
        this.logger.error(`LINE 選單換成 ${alias} 失敗：${(err as Error).message}${cause ? `（${cause}）` : ''}`);
        return;
      }
    }
  }

  private async call(url: string, method = 'GET'): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}` },
      // 空字串 body：讓 fetch 自己帶 Content-Length: 0（LINE 的 POST 沒有它會回 411）
      ...(method === 'POST' ? { body: '' } : {}),
    });
    if (!res.ok) throw new LineApiError(`${method} ${url} → ${res.status} ${await res.text()}`);
    return res;
  }
}

class LineApiError extends Error {}
