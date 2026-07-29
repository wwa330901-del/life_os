import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';

interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

const LINK_CODE_TTL_MINUTES = 10;

/**
 * Backs the 記帳 LINE bot: verifying LINE's webhook signature, linking a
 * LINE account to a life_os user (via a short-lived code generated in the
 * app), and parsing simple "支出/收入 金額 備註 [帳戶]" commands into
 * `FinanceTransaction` rows against that user's personal space. Deliberately
 * bypasses the HTTP-facing `Finance*Service` layer (which is built around
 * "an authenticated user acting on their own space via the app's own
 * endpoints") since this is a different trust boundary — the caller here is
 * LINE itself, authenticated by HMAC signature rather than a JWT, already
 * resolved down to a specific `userId` by the time any finance write
 * happens.
 */
@Injectable()
export class LineService {
  private readonly logger = new Logger(LineService.name);
  private readonly channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';
  private readonly channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.channelSecret) return false;
    const expected = crypto.createHmac('sha256', this.channelSecret).update(rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  async generateLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);
    await this.prisma.lineAccountLink.upsert({
      where: { userId },
      create: { userId, linkCode: code, linkCodeExpiresAt: expiresAt },
      update: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });
    return { code, expiresAt };
  }

  async handleEvents(events: LineWebhookEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type !== 'message' || event.message?.type !== 'text') continue;
      const lineUserId = event.source?.userId;
      const text = event.message.text?.trim();
      const replyToken = event.replyToken;
      if (!lineUserId || !text || !replyToken) continue;

      try {
        const link = await this.prisma.lineAccountLink.findUnique({ where: { lineUserId } });
        if (link) {
          await this.handleTransactionCommand(link.userId, text, replyToken);
        } else {
          await this.tryCompleteLinking(lineUserId, text, replyToken);
        }
      } catch (error) {
        this.logger.error('Failed to handle LINE event', error);
      }
    }
  }

  private async tryCompleteLinking(lineUserId: string, code: string, replyToken: string) {
    const pending = await this.prisma.lineAccountLink.findUnique({ where: { linkCode: code } });
    if (!pending || !pending.linkCodeExpiresAt || pending.linkCodeExpiresAt < new Date()) {
      await this.reply(replyToken, '綁定碼無效或已過期，請到元序 App 的記帳頁重新產生一組綁定碼。');
      return;
    }
    await this.prisma.lineAccountLink.update({
      where: { id: pending.id },
      data: { lineUserId, linkCode: null, linkCodeExpiresAt: null },
    });
    await this.reply(
      replyToken,
      '綁定成功！以後可以直接傳「支出 120 午餐 現金」這樣的訊息記帳，帳戶可以省略，會用你排序第一個的帳戶。',
    );
  }

  private async handleTransactionCommand(userId: string, text: string, replyToken: string) {
    const parsed = this.parseCommand(text);
    if (!parsed) {
      await this.reply(
        replyToken,
        '看不懂這則訊息，格式是「支出 金額 備註 [帳戶]」或「收入 金額 備註 [帳戶]」，例如「支出 120 午餐 現金」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) {
      await this.reply(replyToken, '找不到你的個人空間，請先到元序 App 登入一次。');
      return;
    }

    const accounts = await this.prisma.financeAccount.findMany({
      where: { spaceId: space.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (accounts.length === 0) {
      await this.reply(replyToken, '你還沒有任何記帳帳戶，請先到元序 App 的記帳「帳戶」分頁新增一個。');
      return;
    }

    let account = accounts[0];
    let rest = parsed.rest;
    if (rest.length > 0) {
      const lastToken = rest[rest.length - 1];
      const matched = accounts.find((a) => a.name === lastToken);
      if (matched) {
        account = matched;
        rest = rest.slice(0, -1);
      }
    }
    const note = rest.join(' ') || null;

    await this.prisma.financeTransaction.create({
      data: {
        spaceId: space.id,
        type: parsed.type,
        amount: parsed.amount,
        accountId: account.id,
        date: new Date(),
        note,
      },
    });

    const typeLabel = parsed.type === FinanceTransactionType.EXPENSE ? '支出' : '收入';
    await this.reply(
      replyToken,
      `已記錄${typeLabel} ${parsed.amount}（${account.name}）${note ? ' · ' + note : ''}`,
    );
  }

  /** Not categorized (`categoryId` stays null) — the command format the
   * user chose is deliberately just "類型 金額 備註 [帳戶]" with no category
   * token, so a LINE-recorded transaction shows as 未分類 until edited in
   * the app if the user wants it counted toward a specific budget. */
  private parseCommand(
    text: string,
  ): { type: FinanceTransactionType; amount: number; rest: string[] } | null {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    const type =
      tokens[0] === '支出'
        ? FinanceTransactionType.EXPENSE
        : tokens[0] === '收入'
          ? FinanceTransactionType.INCOME
          : null;
    if (!type) return null;
    const amount = Number(tokens[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { type, amount, rest: tokens.slice(2) };
  }

  private async reply(replyToken: string, text: string): Promise<void> {
    if (!this.channelAccessToken) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set, skipping reply');
      return;
    }
    try {
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
      });
    } catch (error) {
      this.logger.error('Failed to send LINE reply', error);
    }
  }
}
