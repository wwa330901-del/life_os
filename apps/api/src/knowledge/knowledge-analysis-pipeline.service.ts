import { Inject, Injectable, Logger } from '@nestjs/common';
import { KnowledgeItemsService } from './knowledge-items.service';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import {
  ContentFetcherService,
  FetchedContent,
  INSTAGRAM_UNSUPPORTED_MESSAGE,
} from './content-fetcher.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AiUsageService } from './ai-usage.service';
import { GEMINI_MODEL } from './ai/gemini-content-analysis.service';
import { AI_CONTENT_ANALYSIS_SERVICE } from './ai/ai-content-analysis.interface';
import type { AiContentAnalysisService } from './ai/ai-content-analysis.interface';
import { AiUsageStatus } from '../../generated/prisma/client.js';

const NO_API_KEY_MESSAGE =
  '你還沒有設定自己的 Gemini API 金鑰，請先到 App 的「AI 設定」貼上你自己的金鑰才能使用知識庫分析功能。';

/** Ties fetch -> AI analysis -> persistence together, run fire-and-forget
 * from the LINE webhook handler (which has already replied "收到，分析中"
 * and must not block on this). No Redis/BullMQ — a KnowledgeItem row's
 * `status` column IS the job queue; this project's personal-scale traffic
 * doesn't need more than that (see 大系統 doc for the reasoning). Every
 * entry point catches its own errors and records them on the item via
 * `markFailed` — nothing here ever throws back to a caller that isn't
 * already inside a try/catch of its own. Completion (success, needs a
 * category decision, or failure) is always reported back via a LINE PUSH
 * (not reply — the original replyToken is long since consumed).
 *
 * Every user brings their own Gemini API key (billed to their own Google
 * account, by explicit design — no shared/fallback key) — `requireApiKey`
 * fails fast before any fetch/AI work happens if one isn't set. */
@Injectable()
export class KnowledgeAnalysisPipeline {
  private readonly logger = new Logger(KnowledgeAnalysisPipeline.name);

  constructor(
    private readonly itemsService: KnowledgeItemsService,
    private readonly categoriesService: KnowledgeCategoriesService,
    private readonly contentFetcher: ContentFetcherService,
    private readonly lineNotifier: LineNotifierService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly aiUsageService: AiUsageService,
    @Inject(AI_CONTENT_ANALYSIS_SERVICE)
    private readonly aiService: AiContentAnalysisService,
  ) {}

  async processUrlSubmission(
    itemId: string,
    ownerUserId: string,
    url: string,
  ): Promise<void> {
    try {
      const apiKey = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      const fetched = await this.contentFetcher.fetchFromUrl(url);
      await this.runAnalysis(itemId, ownerUserId, apiKey, fetched);
    } catch (error) {
      this.logger.error(`知識庫網址分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        this.userFacingMessage(error),
      );
    }
  }

  async processImageSubmission(
    itemId: string,
    ownerUserId: string,
    image: { data: Buffer; mimeType: string },
  ): Promise<void> {
    try {
      const apiKey = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.runAnalysis(itemId, ownerUserId, apiKey, {
        sourcePlatform: '圖片',
        image,
      });
    } catch (error) {
      this.logger.error(`知識庫圖片分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        this.userFacingMessage(error),
      );
    }
  }

  /** 「分析 <文字>」— pasted plain text needs no fetch step at all (unlike a
   * URL, the text itself already IS the content), so this skips
   * `ContentFetcherService` entirely and goes straight to `runAnalysis`. */
  async processTextSubmission(
    itemId: string,
    ownerUserId: string,
    text: string,
  ): Promise<void> {
    try {
      const apiKey = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.runAnalysis(itemId, ownerUserId, apiKey, {
        sourcePlatform: '貼上文字',
        extractedText: text,
      });
    } catch (error) {
      this.logger.error(`知識庫文字分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        this.userFacingMessage(error),
      );
    }
  }

  /** A screen recording/clip sent via LINE — distinct from a YouTube link
   * (which Gemini watches by URI reference, no upload needed here). */
  async processVideoSubmission(
    itemId: string,
    ownerUserId: string,
    video: { data: Buffer; mimeType: string },
  ): Promise<void> {
    try {
      const apiKey = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.runAnalysis(itemId, ownerUserId, apiKey, {
        sourcePlatform: '影片',
        video,
      });
    } catch (error) {
      this.logger.error(`知識庫影片分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        this.userFacingMessage(error),
      );
    }
  }

  /** The "no API key" error is already a complete, friendly instruction —
   * everything else gets a generic wrapper so a raw technical message
   * (e.g. "Fetch failed with status 404") doesn't show up unexplained. */
  private userFacingMessage(error: unknown): string {
    const message = this.errorMessage(error);
    return message === NO_API_KEY_MESSAGE ||
      message === INSTAGRAM_UNSUPPORTED_MESSAGE
      ? message
      : `這則知識庫內容分析失敗了：${message}`;
  }

  private async requireApiKey(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);
    if (!user?.geminiApiKey) {
      throw new Error(NO_API_KEY_MESSAGE);
    }
    return user.geminiApiKey;
  }

  private async runAnalysis(
    itemId: string,
    ownerUserId: string,
    apiKey: string,
    fetched: FetchedContent,
  ): Promise<void> {
    await this.itemsService.updateSourcePlatform(
      itemId,
      fetched.sourcePlatform,
    );

    const item = await this.itemsService.getByIdInternal(itemId);
    const existingCategories =
      await this.categoriesService.getCategoriesForAi(ownerUserId);

    const startedAt = Date.now();
    const outcome = await this.aiService
      .analyze({
        apiKey,
        sourcePlatform: fetched.sourcePlatform,
        sourceUrl: item.sourceUrl ?? undefined,
        extractedText: fetched.extractedText,
        youtubeUrl: fetched.youtubeUrl,
        image: fetched.image,
        video: fetched.video,
        existingCategories,
      })
      .catch(async (error: unknown) => {
        await this.aiUsageService.record({
          userId: ownerUserId,
          feature: 'knowledge',
          model: GEMINI_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - startedAt,
          status: AiUsageStatus.FAILED,
          errorMessage: this.errorMessage(error),
        });
        throw error;
      });

    await this.aiUsageService.record({
      userId: ownerUserId,
      feature: 'knowledge',
      model: outcome.usage.model,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      durationMs: Date.now() - startedAt,
      status: AiUsageStatus.SUCCESS,
    });

    const applyOutcome = await this.itemsService.applyAnalysisResult(
      itemId,
      fetched.extractedText,
      outcome.result,
    );
    if (applyOutcome.status === 'DONE') {
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `已建立資料，分類為 ${applyOutcome.categoryName}`,
      );
    } else {
      // 記錄「這個帳號正在等你回覆分類」——沒有這一步，使用者接下來回覆的
      // 分類名稱只會被當成一般指令解析，永遠對不到這則資料上。
      await this.prisma.lineAccountLink.updateMany({
        where: { userId: ownerUserId },
        data: { pendingKnowledgeItemId: itemId },
      });
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `這則內容好像沒有適合的分類，建議新增「${applyOutcome.suggestedCategoryName}」分類。\n回覆「新增」建立，或回覆一個你現有的分類名稱來歸類到那裡。`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '分析失敗';
  }
}
