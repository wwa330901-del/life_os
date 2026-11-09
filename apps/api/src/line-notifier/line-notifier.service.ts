import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 訊息裡的按鈕：按了會回傳 data（postback），聊天室顯示 label。 */
export interface LineMessageButton {
  label: string;
  data: string;
}

/** 按鈕做在訊息本身（Flex）而不是 quick reply：quick reply 只掛在最新一則，
 * 下一則訊息一來就消失，連續兩個提醒時第一個就沒辦法按了。 */
export function buttonMessage(text: string, buttons: LineMessageButton[]) {
  return {
    type: 'flex',
    altText: text.slice(0, 400),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text, wrap: true }] },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: buttons.map((b, index) => ({
          type: 'button',
          style: index === 0 ? 'primary' : 'secondary',
          height: 'sm',
          action: { type: 'postback', label: b.label, data: b.data, displayText: b.label },
        })),
      },
    },
  };
}

/** Proactively pushes a LINE text message outside of any inbound webhook
 * event — used by background jobs (e.g. `FinanceRecurringTransactionsService`'s
 * daily cron) that have no `replyToken` to work with. Split out of
 * `LineModule` instead of living in `LineService` so modules that need to
 * notify a user (like `FinanceModule`) don't have to depend on the whole
 * LINE webhook module, which itself depends on `FinanceModule` — that
 * would be a circular import. */
@Injectable()
export class LineNotifierService {
  private readonly logger = new Logger(LineNotifierService.name);
  private readonly channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  /** No-op if this space isn't a personal space or its owner never linked
   * a LINE account — there's no other channel to reach them through, so a
   * silent skip is the right behavior rather than throwing. */
  async notifyBySpace(spaceId: string, text: string): Promise<void> {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space?.ownerUserId) return;
    await this.notifyByUser(space.ownerUserId, text);
  }

  /** No-op if this user never linked a LINE account. */
  async notifyByUser(userId: string, text: string, buttons?: LineMessageButton[]): Promise<void> {
    const link = await this.prisma.lineAccountLink.findUnique({ where: { userId } });
    if (!link?.lineUserId) return;
    await this.push(link.lineUserId, buttons?.length ? buttonMessage(text, buttons) : { type: 'text', text });
  }

  private async push(lineUserId: string, message: Record<string, unknown>): Promise<void> {
    if (!this.channelAccessToken) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set, skipping push');
      return;
    }
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({ to: lineUserId, messages: [message] }),
      });
      if (!response.ok) this.logger.error(`LINE push 失敗（${response.status}）：${await response.text()}`);
    } catch (error) {
      this.logger.error('Failed to send LINE push', error);
    }
  }
}
