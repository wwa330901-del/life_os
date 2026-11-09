import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { formatTaipeiDateTime } from '../common/taipei-date';

const MAX_TEXT_LENGTH = 2000;
const MAX_QUOTE_IN_PROMPT = 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PLACEHOLDER: Record<string, string> = {
  image: '（一張圖片）',
  video: '（一段影片）',
  audio: '（一段語音）',
  location: '（一個位置）',
  sticker: '（一張貼圖）',
  file: '（一個檔案）',
};

export interface QuotedMessage {
  fromUser: boolean;
  text: string;
  todoId: string | null;
  createdAt: Date;
}

/** 把引用的那則訊息放進給 AI 的文字。null＝LINE 說有引用，但內容沒記到（太舊）。 */
export function withQuoteContext(text: string, quoted: QuotedMessage | null): string {
  if (!quoted) return `（他這則是回覆之前的某一則訊息，但那則太舊、內容查不到了；看不出在講什麼就直接問他，不要猜）\n${text}`;
  const who = quoted.fromUser ? '他自己之前傳的' : '你之前傳給他的';
  return `（他這則是在回覆${who}這則訊息（${formatTaipeiDateTime(quoted.createdAt, false)}）：\n「${quoted.text.slice(0, MAX_QUOTE_IN_PROMPT)}」\n他說的「這個」「那筆」就是指這則）\n${text}`;
}

/** LINE 只告訴我們使用者引用了哪個訊息 id，不給內容，所以來回的訊息要自己記。
 * 記錄失敗不能影響訊息本身，這裡的方法都不丟錯。 */
@Injectable()
export class LineMessageLogService {
  private readonly logger = new Logger(LineMessageLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `messages` 跟回應的 sentMessages 順序一一對應。 */
  async recordSent(
    userId: string,
    messages: { text?: string; altText?: string }[],
    response: Response,
    todoId?: string,
  ): Promise<void> {
    try {
      if (!response.ok) return;
      const { sentMessages } = (await response.json()) as { sentMessages?: { id: string }[] };
      const rows = (sentMessages ?? []).flatMap((sent, index) => {
        const text = messages[index]?.text ?? messages[index]?.altText;
        return text ? [{ id: sent.id, userId, fromUser: false, text: text.slice(0, MAX_TEXT_LENGTH), todoId }] : [];
      });
      if (rows.length) await this.prisma.lineMessage.createMany({ data: rows, skipDuplicates: true });
    } catch (error) {
      this.logger.warn(`記錄送出的 LINE 訊息失敗：${String(error)}`);
    }
  }

  async recordReceived(userId: string, message: { id?: string; type: string; text?: string }): Promise<void> {
    if (!message.id) return;
    try {
      const text = (message.text ?? PLACEHOLDER[message.type] ?? '（一則訊息）').slice(0, MAX_TEXT_LENGTH);
      await this.prisma.lineMessage.createMany({ data: [{ id: message.id, userId, fromUser: true, text }], skipDuplicates: true });
    } catch (error) {
      this.logger.warn(`記錄收到的 LINE 訊息失敗：${String(error)}`);
    }
  }

  async findQuoted(userId: string, messageId: string): Promise<QuotedMessage | null> {
    try {
      return await this.prisma.lineMessage.findFirst({
        where: { id: messageId, userId },
        select: { fromUser: true, text: true, todoId: true, createdAt: true },
      });
    } catch (error) {
      this.logger.warn(`查 LINE 引用訊息失敗：${String(error)}`);
      return null;
    }
  }

  @Cron('30 4 * * *', { timeZone: 'Asia/Taipei' })
  async deleteOld(now = new Date()) {
    await this.prisma.lineMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
  }
}
