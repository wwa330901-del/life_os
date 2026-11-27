import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarEventsService } from '../calendar/calendar-events.service';
import { KnowledgeItemsService } from '../knowledge/knowledge-items.service';
import { KnowledgeAnalysisPipeline } from '../knowledge/knowledge-analysis-pipeline.service';
import { InstagramFetcherService } from '../knowledge/instagram-fetcher.service';
import { isInstagramUrl, INSTAGRAM_UNSUPPORTED_MESSAGE } from '../knowledge/content-fetcher.service';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import { LineReplyService } from './line-reply.service';
import { LEADING_SEPARATORS } from './line-shared';
import { KnowledgeBrainService } from '../knowledge/knowledge-brain.service';
import { sourceKeyForBytes, sourceKeyForText, sourceKeyForUrl } from '../knowledge/knowledge-source-key';

/** LINE 收藏：存連結／文字／影片、分類決定、找地點、展覽排進行事曆。 */
@Injectable()
export class LineKnowledgeService {
  private readonly logger = new Logger(LineKnowledgeService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarEventsService: CalendarEventsService,
    private readonly knowledgeItemsService: KnowledgeItemsService,
    private readonly knowledgeAnalysisPipeline: KnowledgeAnalysisPipeline,
    private readonly instagramFetcherService: InstagramFetcherService,
    private readonly out: LineReplyService,
    private readonly brain: KnowledgeBrainService,
  ) {}

  /** 重複偵測（2026-11-27）：存過一樣的就不再存，回「存過了」＋兩個按鈕。 */
  async replyIfDuplicate(userId: string, sourceKey: string | null, replyToken: string): Promise<boolean> {
    const dup = await this.brain.findDuplicate(userId, sourceKey);
    if (!dup) return false;
    if (dup.status !== 'DONE') {
      await this.out.reply(replyToken, this.brain.duplicateMessage(dup));
      return true;
    }
    await this.out.replyWithButtons(replyToken, this.brain.duplicateMessage(dup), [
      { label: '看那一則', data: `kb:show:${dup.id}` },
      { label: '重新分析那一則', data: `kb:redo:${dup.id}` },
    ]);
    return true;
  }

  /** 「存過了」訊息上的按鈕。 */
  async handleKnowledgePostback(link: LineAccountLink, data: string, replyToken: string) {
    const [, action, itemId] = data.split(':');
    const item = await this.knowledgeItemsService.getByIdInternal(itemId).catch(() => null);
    if (!item || item.ownerUserId !== link.userId) {
      await this.out.reply(replyToken, '找不到這則收藏，可能已經刪掉了。');
      return;
    }
    if (action === 'show') {
      const lines = [`🧠 ${item.title ?? '未命名'}`, item.summary ?? '', item.sourceUrl ?? ''].filter(Boolean);
      await this.out.reply(replyToken, lines.join('\n\n'));
      return;
    }
    if (action === 'plan') {
      await this.knowledgeItemsService.setExhibitionDecision(itemId, 'SCHEDULED');
      await this.prisma.lineAccountLink.update({ where: { id: link.id }, data: { pendingExhibitionScheduleItemId: itemId } });
      await this.out.reply(replyToken, `好，「${item.title ?? '這個活動'}」要排什麼時候？例如「12/6 14:00」或「明天」。`);
      return;
    }
    if (action === 'skip') {
      await this.knowledgeItemsService.setExhibitionDecision(itemId, 'CANCELLED');
      await this.out.reply(replyToken, '好，這個不會再提醒你了（還是留在大腦裡）。');
      return;
    }
    if (action === 'redo') {
      await this.out.reply(replyToken, '好，重新分析中，好了會再通知你。');
      void this.knowledgeAnalysisPipeline.reanalyze(itemId, link.userId);
    }
  }

  extractUrl(text: string): string | null {
    const match = text.match(/https?:\/\/\S+/);
    return match ? match[0] : null;
  }

  async captureKnowledgeUrl(
    userId: string,
    url: string,
    replyToken: string,
  ) {
    if (isInstagramUrl(url) && !this.instagramFetcherService.configured) {
      await this.out.reply(replyToken, INSTAGRAM_UNSUPPORTED_MESSAGE);
      return;
    }
    const sourceKey = sourceKeyForUrl(url);
    if (await this.replyIfDuplicate(userId, sourceKey, replyToken)) return;

    const item = await this.knowledgeItemsService.createPending(userId, {
      sourceUrl: url,
      sourcePlatform: '', // overwritten once the fetcher actually determines it
      sourceKey,
    });
    await this.out.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
    // Fire-and-forget — must not block the webhook's reply, and the actual
    // completion is reported back via a LINE push once done (see
    // KnowledgeAnalysisPipeline).
    void this.knowledgeAnalysisPipeline.processUrlSubmission(
      item.id,
      userId,
      url,
    );
  }

  /** 「分析 <文字>」——貼上的純文字不像網址/圖片/影片，需要明確的「分析」前綴
   * 才知道這是要收藏，不是打錯指令（2026-08-05 使用者明確選擇的設計）。跟
   * `captureKnowledgeUrl`同樣的建立-pending-再丟給pipeline流程，只是完全不
   * 需要`ContentFetcherService`——貼上的文字本身就是內容，不用另外抓取。 */
  async captureKnowledgeText(
    userId: string,
    text: string,
    replyToken: string,
  ) {
    const content = text.replace(/^分析/, '').replace(LEADING_SEPARATORS, '').trim();
    if (!content) {
      await this.out.reply(replyToken, '請在「分析」後面接你想收藏的文字內容，例如「分析 <貼上的文章內容>」。');
      return;
    }

    const sourceKey = sourceKeyForText(content);
    if (await this.replyIfDuplicate(userId, sourceKey, replyToken)) return;
    const item = await this.knowledgeItemsService.createPending(userId, {
      sourcePlatform: '貼上文字',
      sourceKey,
    });
    await this.out.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
    void this.knowledgeAnalysisPipeline.processTextSubmission(
      item.id,
      userId,
      content,
    );
  }

  /** Same idea as `handleImageMessage` — a screen recording/clip sent
   * straight to the bot (not a YouTube link, which is handled by
   * `captureKnowledgeUrl` instead since Gemini watches that by URI
   * reference). 2026-08-04: this message type was previously not handled
   * at all — `handleEvents`'s type filter silently dropped it, so a video
   * sent to the bot got no ack and no analysis, ever. */
  async handleVideoMessage(
    linkId: string,
    userId: string,
    messageId: string | undefined,
    replyToken: string,
  ) {
    if (!messageId) return;
    try {
      const data = await this.out.fetchLineMessageContent(messageId);
      const sourceKey = sourceKeyForBytes(data);
      if (await this.replyIfDuplicate(userId, sourceKey, replyToken)) return;
      const item = await this.knowledgeItemsService.createPending(userId, {
        sourcePlatform: '影片',
        sourceKey,
      });
      await this.out.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
      void this.knowledgeAnalysisPipeline.processVideoSubmission(
        item.id,
        userId,
        {
          data,
          mimeType: 'video/mp4',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch LINE video content for link=${linkId}`,
        error as Error,
      );
      await this.out.reply(replyToken, '影片下載失敗，請再傳一次看看。');
    }
  }

  async tryResolveKnowledgeCategoryDecision(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const itemId = link.pendingKnowledgeItemId;
    if (!itemId) return;
    try {
      const categoryName =
        await this.knowledgeItemsService.resolveCategoryDecision(
          link.userId,
          itemId,
          text,
        );
      await this.prisma.lineAccountLink.update({
        where: { id: link.id },
        data: { pendingKnowledgeItemId: null },
      });
      await this.out.reply(replyToken, `已歸類到「${categoryName}」。`);
    } catch (error) {
      await this.out.reply(
        replyToken,
        error instanceof Error ? error.message : '設定失敗，請再試一次。',
      );
    }
  }

  /** 美食/景點 — after the rich-menu button set
   * `pendingKnowledgeLocationQueryCategory`, this reply's text is the
   * location to search for, matched against the "地址" field. */
  async resolveKnowledgeLocationQuery(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const categoryName = link.pendingKnowledgeLocationQueryCategory!;
    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingKnowledgeLocationQueryCategory: null },
    });

    const items = await this.knowledgeItemsService.searchByLocation(
      link.userId,
      categoryName,
      text.trim(),
    );
    if (items.length === 0) {
      await this.out.reply(
        replyToken,
        `附近沒有找到記錄過的${categoryName}（「${text.trim()}」）。`,
      );
      return;
    }
    const lines = [`📍 ${categoryName}搜尋結果（${text.trim()}）`, ''];
    for (const item of items) {
      const address = this.knowledgeItemsService.fieldTextValue(item, '地址');
      lines.push(
        `・${item.title ?? '未命名'}${address ? `（${address}）` : ''}`,
      );
    }
    await this.out.reply(replyToken, lines.join('\n'));
  }

  async sendUpcomingExhibitions(userId: string, replyToken: string) {
    const items =
      await this.knowledgeItemsService.listUpcomingExhibitions(userId);
    if (items.length === 0) {
      await this.out.reply(replyToken, '📅 展覽\n\n（目前沒有記錄中的展覽）');
      return;
    }
    const lines = ['📅 展覽、活動（快結束的在前面）', ''];
    for (const item of items) {
      const endDate = item.eventEndDate;
      const visited = this.knowledgeItemsService.fieldBooleanValue(
        item,
        '是否已觀展',
      );
      lines.push(
        `・${item.title ?? '未命名'}${endDate ? `（至 ${endDate.getUTCMonth() + 1}/${endDate.getUTCDate()}）` : ''}${visited ? '（已觀展）' : ''}`,
      );
    }
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** Two-phase conversation over the same pending slot
   * (`pendingExhibitionScheduleItemId`), disambiguated by the item's own
   * `exhibitionDecisionStatus`: still null means this reply is the initial
   * 安排/不安排 answer; already SCHEDULED means this reply is the follow-up
   * 何時 answer. Writes both a CalendarEvent (so it shows on the calendar)
   * and a personal ProjectTodo due the same day (so it also surfaces in the
   * daily 代辦事項 digest) — the todo is created via `personalOwnerUserId`,
   * same as any other 個人 todo. */
  async resolveExhibitionSchedule(
    link: LineAccountLink,
    text: string,
    replyToken: string,
  ) {
    const itemId = link.pendingExhibitionScheduleItemId;
    if (!itemId) return;
    const item = await this.knowledgeItemsService.getByIdInternal(itemId);
    const trimmed = text.trim();

    if (item.exhibitionDecisionStatus === null) {
      if (trimmed === '安排') {
        await this.knowledgeItemsService.setExhibitionDecision(
          itemId,
          'SCHEDULED',
        );
        await this.out.reply(
          replyToken,
          '好的，請問要安排什麼時候？例如「8/10 14:00」或「明天」。',
        );
        return;
      }
      if (trimmed === '不安排') {
        await this.knowledgeItemsService.setExhibitionDecision(
          itemId,
          'CANCELLED',
        );
        await this.prisma.lineAccountLink.update({
          where: { id: link.id },
          data: { pendingExhibitionScheduleItemId: null },
        });
        await this.out.reply(replyToken, '好的，已取消觀展安排。');
        return;
      }
      await this.out.reply(replyToken, '請回覆「安排」或「不安排」。');
      return;
    }

    const scheduledAt = this.parseExhibitionDateTimeReply(trimmed);
    if (!scheduledAt) {
      await this.out.reply(
        replyToken,
        '看不懂時間，請用「8/10 14:00」這種格式，或直接打「明天」「今天」。',
      );
      return;
    }

    const space = await this.prisma.space.findUnique({
      where: { calendarOwnerUserId: link.userId },
    });
    if (!space) {
      await this.out.reply(
        replyToken,
        '你還沒有行事曆空間，請先到元序 App 建立一個，我先幫你記著這個安排。',
      );
      return;
    }
    await this.calendarEventsService.create(link.userId, space.id, {
      title: `${item.title ?? '展覽'}`,
      startAt: scheduledAt.toISOString(),
      allDay: false,
    });
    const maxSortOrder = await this.prisma.projectTodo.aggregate({
      where: { personalOwnerUserId: link.userId },
      _max: { sortOrder: true },
    });
    await this.prisma.projectTodo.create({
      data: {
        personalOwnerUserId: link.userId,
        title: `觀展：${item.title ?? '展覽'}`,
        dueDate: scheduledAt,
        isOngoing: false,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await this.knowledgeItemsService.setExhibitionDecision(
      itemId,
      'SCHEDULED',
      scheduledAt,
    );
    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingExhibitionScheduleItemId: null },
    });
    const dateLabel = `${scheduledAt.getMonth() + 1}/${scheduledAt.getDate()} ${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
    await this.out.reply(
      replyToken,
      `已安排「${item.title ?? '展覽'}」（${dateLabel}），加進你的行事曆和代辦事項了。`,
    );
  }

  /** "M/D HH:MM"／"M/D"（預設10:00）／"今天"／"明天" — a small standalone
   * parser distinct from `parseCalendarCommand` since there's no
   * "新增行事曆" prefix to strip here, just a bare date/time reply. */
  parseExhibitionDateTimeReply(text: string): Date | null {
    const now = new Date();
    if (text === '今天')
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0);
    if (text === '明天') {
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      return new Date(
        tomorrow.getFullYear(),
        tomorrow.getMonth(),
        tomorrow.getDate(),
        10,
        0,
      );
    }

    const match = text.match(
      /^(\d{1,2})\/(\d{1,2})(?:[\s]+(\d{1,2}):(\d{2}))?/,
    );
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const hour = match[3] ? Number(match[3]) : 10;
    const minute = match[4] ? Number(match[4]) : 0;
    const date = new Date(now.getFullYear(), month - 1, day, hour, minute);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
