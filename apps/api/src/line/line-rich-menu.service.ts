import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

export interface MenuAction {
  label: string;
  data: string;
}

interface GridArea {
  item: MenuAction;
  bounds: { x: number; y: number; width: number; height: number };
}

const CANVAS_WIDTH = 2500;
/** Single-row menus (≤5 buttons) use the same height as the main 3-button
 * menu so the switch between them doesn't visibly resize the menu bar. */
const ROW_HEIGHT_SMALL = 843;
/** LINE's hard cap on a rich menu's pixel height. */
const MAX_GRID_HEIGHT = 1686;
/** LINE's hard cap on tappable areas per rich menu. */
const MAX_AREAS = 20;

/**
 * Wraps LINE's Rich Menu API so the 記帳 guided flow can show its 支出/收入
 * → 分類 → 帳戶 choices as the bottom persistent menu (linked per-user)
 * instead of in-chat quick-reply bubbles. `createSelectionMenu` renders a
 * grid image on the fly via `sharp` — category/account lists are
 * per-user-editable, so those menus can't be pre-built like the static
 * 3-button main menu. Menu lifecycle (deleting stale per-user menus) is the
 * caller's responsibility; this service only wraps the LINE API + image
 * rendering primitives.
 */
@Injectable()
export class LineRichMenuService {
  private readonly logger = new Logger(LineRichMenuService.name);
  private readonly channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  private typeMenuId: string | null = null;

  /** 支出/收入/取消 — fixed content shared by every user, created once and
   * cached for the process lifetime (looked up by name first so a server
   * restart doesn't leak a duplicate). */
  async getOrCreateTypeMenu(): Promise<string> {
    if (this.typeMenuId) return this.typeMenuId;
    const name = '元序-記帳類型選單';
    const existing = await this.findMenuByName(name);
    this.typeMenuId = existing ?? (await this.createSelectionMenu([
      { label: '💸 支出', data: 't:EXPENSE' },
      { label: '💰 收入', data: 't:INCOME' },
    ], name));
    return this.typeMenuId;
  }

  /** Builds + uploads a rich menu whose tappable areas map 1:1 to `items`
   * (a 取消 button is appended automatically). Returns the new richMenuId —
   * caller owns its lifecycle and must call `deleteMenu` once it's no
   * longer linked to anyone. */
  async createSelectionMenu(items: MenuAction[], name: string): Promise<string> {
    const all = [...items, { label: '取消', data: 'cancel' }].slice(0, MAX_AREAS);
    const { areas, height } = this.layoutGrid(all);

    const created = await this.callLineApi<{ richMenuId: string }>('POST', '/richmenu', {
      size: { width: CANVAS_WIDTH, height },
      selected: false,
      name,
      chatBarText: '選單',
      areas: areas.map((a) => ({
        bounds: a.bounds,
        action: {
          type: 'postback',
          label: a.item.label.slice(0, 20),
          data: a.item.data,
          displayText: a.item.label,
        },
      })),
    });

    const image = await this.renderGridImage(areas, CANVAS_WIDTH, height);
    await this.uploadImage(created.richMenuId, image);
    return created.richMenuId;
  }

  /** Overrides this specific LINE user's menu (LINE keeps this until
   * explicitly unlinked, independent of the channel-wide default). */
  async linkToUser(lineUserId: string, richMenuId: string): Promise<void> {
    await this.callLineApi('POST', `/user/${lineUserId}/richmenu/${richMenuId}`);
  }

  /** Removes this user's override so they fall back to the channel-wide
   * default menu (the static 記帳/財務總覽/代辦事項 one). Best-effort — a
   * failure here shouldn't block whatever reply triggered the revert. */
  async unlinkUser(lineUserId: string): Promise<void> {
    try {
      await this.callLineApi('DELETE', `/user/${lineUserId}/richmenu`);
    } catch (error) {
      this.logger.warn(`unlink user ${lineUserId} 的 rich menu 失敗：${error}`);
    }
  }

  async deleteMenu(richMenuId: string): Promise<void> {
    try {
      await this.callLineApi('DELETE', `/richmenu/${richMenuId}`);
    } catch (error) {
      this.logger.warn(`刪除 rich menu ${richMenuId} 失敗：${error}`);
    }
  }

  private async findMenuByName(name: string): Promise<string | null> {
    const { richmenus } = await this.callLineApi<{ richmenus: { richMenuId: string; name: string }[] }>(
      'GET',
      '/richmenu/list',
    );
    return richmenus.find((m) => m.name === name)?.richMenuId ?? null;
  }

  /** ≤5 items → one row at the main menu's height (visually consistent
   * with the default menu). More items → a grid up to 5 columns × 4 rows
   * (20 areas, LINE's max), height capped at LINE's 1686px limit. */
  private layoutGrid(items: MenuAction[]): { areas: GridArea[]; height: number } {
    const columns = items.length <= 5 ? items.length : 5;
    const rows = Math.ceil(items.length / columns);
    const height = rows <= 1 ? ROW_HEIGHT_SMALL : Math.floor(MAX_GRID_HEIGHT / rows) * rows;
    const rowHeight = Math.floor(height / rows);
    const colWidth = Math.floor(CANVAS_WIDTH / columns);

    const areas = items.map((item, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const isLastCol = col === columns - 1;
      const isLastRow = row === rows - 1;
      return {
        item,
        bounds: {
          x: col * colWidth,
          y: row * rowHeight,
          width: isLastCol ? CANVAS_WIDTH - col * colWidth : colWidth,
          height: isLastRow ? height - row * rowHeight : rowHeight,
        },
      };
    });
    return { areas, height };
  }

  private async renderGridImage(areas: GridArea[], width: number, height: number): Promise<Buffer> {
    const cells = areas
      .map(({ item, bounds }, i) => {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const fill = i % 2 === 0 ? '#262220' : '#1c1917';
        const fontSize = Math.max(28, Math.min(64, Math.floor(bounds.width / 6)));
        const label = escapeXml(item.label);
        return `
        <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${fill}" stroke="#4a4340" stroke-width="2"/>
        <text x="${cx}" y="${cy}" font-size="${fontSize}" font-family="'Microsoft JhengHei','PingFang TC',sans-serif" font-weight="700" fill="#f5f0ec" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
      })
      .join('\n');

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private async uploadImage(richMenuId: string, image: Buffer): Promise<void> {
    const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${this.channelAccessToken}` },
      body: new Uint8Array(image),
    });
    if (!res.ok) {
      throw new Error(`LINE rich menu 圖片上傳失敗：${res.status} ${await res.text()}`);
    }
  }

  private async callLineApi<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.channelAccessToken) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN 未設定');
    }
    const res = await fetch(`https://api.line.me/v2/bot${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.channelAccessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`LINE API ${method} ${path} 失敗：${res.status} ${await res.text()}`);
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
