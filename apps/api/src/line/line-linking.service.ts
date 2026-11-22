import { Injectable } from '@nestjs/common';
import { LineRichMenuService } from '../users/line-rich-menu.service';
import { PrismaService } from '../prisma/prisma.service';
import { LineReplyService } from './line-reply.service';

/** LINE 綁定元序帳號（輸入 App 給的 6 位數綁定碼）。 */
@Injectable()
export class LineLinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineRichMenu: LineRichMenuService,
    private readonly out: LineReplyService,
  ) {}

  async tryCompleteLinking(
    lineUserId: string,
    code: string,
    replyToken: string,
  ) {
    const pending = await this.prisma.lineAccountLink.findUnique({
      where: { linkCode: code },
    });
    if (
      !pending ||
      !pending.linkCodeExpiresAt ||
      pending.linkCodeExpiresAt < new Date()
    ) {
      await this.out.reply(
        replyToken,
        '綁定碼無效或已過期，請到元序 App 的記帳頁重新產生一組綁定碼。',
      );
      return;
    }
    await this.prisma.lineAccountLink.update({
      where: { id: pending.id },
      data: { lineUserId, linkCode: null, linkCodeExpiresAt: null },
    });
    void this.lineRichMenu.applyForUser(pending.userId);
    await this.out.reply(
      replyToken,
      '綁定成功！點下面選單試試看：記帳／財務總覽／代辦事項／代辦事項總覽，或直接傳「新增行事曆 7/31 14:00 開會 @地點」。',
    );
  }

  // --- Routing ---
}
