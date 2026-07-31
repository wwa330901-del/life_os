import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  async notifyByUser(userId: string, text: string): Promise<void> {
    const link = await this.prisma.lineAccountLink.findUnique({ where: { userId } });
    if (!link?.lineUserId) return;
    await this.push(link.lineUserId, text);
  }

  private async push(lineUserId: string, text: string): Promise<void> {
    if (!this.channelAccessToken) {
      this.logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set, skipping push');
      return;
    }
    try {
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
      });
    } catch (error) {
      this.logger.error('Failed to send LINE push', error);
    }
  }
}
