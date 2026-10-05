import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** LINE 圖文選單別名：tools/line-richmenu/upload-themes.js 每套外觀風格上傳一份，別名 theme-{id}。 */
export function themeMenuAlias(appTheme: string | null | undefined): string {
  return `theme-${appTheme || 'dawn'}`;
}

/**
 * 讓每個人的 LINE 圖文選單跟他在 App 選的外觀風格一致。
 * 換風格、綁定 LINE 時呼叫；啟動時也全部對一次（補上傳選單前就選好風格的人）。
 * 失敗只記 warn：選單只是外觀，不影響功能，也不需要通知管理員。
 */
@Injectable()
export class LineRichMenuService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LineRichMenuService.name);
  private readonly token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!this.token) return;
    void this.syncAll();
  }

  async syncAll(): Promise<void> {
    const links = await this.prisma.lineAccountLink.findMany({
      where: { lineUserId: { not: null } },
      select: { lineUserId: true, user: { select: { appTheme: true } } },
    });
    for (const link of links) await this.apply(link.lineUserId!, link.user.appTheme);
  }

  async applyForUser(userId: string): Promise<void> {
    const link = await this.prisma.lineAccountLink.findUnique({
      where: { userId },
      select: { lineUserId: true, user: { select: { appTheme: true } } },
    });
    if (link?.lineUserId) await this.apply(link.lineUserId, link.user.appTheme);
  }

  private async apply(lineUserId: string, appTheme: string | null): Promise<void> {
    if (!this.token) return;
    const alias = themeMenuAlias(appTheme);
    try {
      const res = await this.call(`https://api.line.me/v2/bot/richmenu/alias/${alias}`);
      const { richMenuId } = (await res.json()) as { richMenuId: string };
      await this.call(`https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`, 'POST');
    } catch (err) {
      this.logger.warn(`LINE 選單換成 ${alias} 失敗：${(err as Error).message}`);
    }
  }

  private async call(url: string, method = 'GET'): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(method === 'POST' ? { 'Content-Length': '0' } : {}) },
    });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
    return res;
  }
}
