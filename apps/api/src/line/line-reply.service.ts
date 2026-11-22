import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { LineMessageLogService } from '../line-notifier/line-message-log.service';
import { buttonMessage, type LineMessageButton } from '../line-notifier/line-notifier.service';

/** 回 LINE 訊息（文字、按鈕、輸入中動畫、下載使用者傳的檔案）和每個事件的狀態，其他 LINE 服務共用。 */
@Injectable()
export class LineReplyService {
  private readonly logger = new Logger(LineReplyService.name);
  constructor(
    private readonly messageLog: LineMessageLogService,
  ) {}

  readonly channelAccessToken =
    process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  /** While handling a 語音訊息, the transcript to show above whatever reply
   * the normal text flow sends — so the user can see what was heard. */
  readonly replyPrefix = new AsyncLocalStorage<string>();

  /** Per webhook event: whether the 萬用 AI threw while handling it. */
  readonly eventState = new AsyncLocalStorage<{ aiFailed: boolean; userId?: string }>();

  async fetchLineMessageContent(messageId: string): Promise<Buffer> {
    const response = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: { Authorization: `Bearer ${this.channelAccessToken}` },
      },
    );
    if (!response.ok) {
      throw new Error(`LINE content API returned ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /** 文字＋下面一排按鈕（Flex），按了會送 postback。 */
  async replyWithButtons(replyToken: string, text: string, buttons: LineMessageButton[]): Promise<void> {
    const prefix = this.replyPrefix.getStore();
    if (prefix) text = `${prefix}\n\n${text}`;
    await this.callReplyApi({ replyToken, messages: [buttonMessage(text, buttons)] });
  }

  async reply(replyToken: string, text: string): Promise<void> {
    const prefix = this.replyPrefix.getStore();
    if (prefix) text = `${prefix}\n\n${text}`;
    await this.callReplyApi({ replyToken, messages: [{ type: 'text', text }] });
  }

  /** 聊天室顯示「正在輸入」的動畫，訊息送出時自動消失。失敗無所謂。 */
  async showTyping(lineUserId: string): Promise<void> {
    if (!this.channelAccessToken) return;
    try {
      await fetch('https://api.line.me/v2/bot/chat/loading/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({ chatId: lineUserId, loadingSeconds: 30 }),
      });
    } catch (error) {
      this.logger.warn(`LINE 輸入中動畫失敗：${String(error)}`);
    }
  }

  async callReplyApi(body: Record<string, unknown>): Promise<void> {
    if (!this.channelAccessToken) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set, skipping reply');
      return;
    }
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify(body),
      });
      const userId = this.eventState.getStore()?.userId;
      if (userId) await this.messageLog.recordSent(userId, body.messages as { text?: string; altText?: string }[], response);
    } catch (error) {
      this.logger.error('Failed to send LINE reply', error);
    }
  }
}
