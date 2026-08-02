import { Inject, Injectable, Logger } from '@nestjs/common';
import { KnowledgeItemsService } from './knowledge-items.service';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import {
  ContentFetcherService,
  FetchedContent,
} from './content-fetcher.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { AI_CONTENT_ANALYSIS_SERVICE } from './ai/ai-content-analysis.interface';
import type { AiContentAnalysisService } from './ai/ai-content-analysis.interface';

/** Ties fetch -> AI analysis -> persistence together, run fire-and-forget
 * from the LINE webhook handler (which has already replied "收到，分析中"
 * and must not block on this). No Redis/BullMQ — a KnowledgeItem row's
 * `status` column IS the job queue; this project's personal-scale traffic
 * doesn't need more than that (see 大系統 doc for the reasoning). Every
 * entry point catches its own errors and records them on the item via
 * `markFailed` — nothing here ever throws back to a caller that isn't
 * already inside a try/catch of its own. Completion (success, needs a
 * category decision, or failure) is always reported back via a LINE PUSH
 * (not reply — the original replyToken is long since consumed). */
@Injectable()
export class KnowledgeAnalysisPipeline {
  private readonly logger = new Logger(KnowledgeAnalysisPipeline.name);

  constructor(
    private readonly itemsService: KnowledgeItemsService,
    private readonly categoriesService: KnowledgeCategoriesService,
    private readonly contentFetcher: ContentFetcherService,
    private readonly lineNotifier: LineNotifierService,
    @Inject(AI_CONTENT_ANALYSIS_SERVICE)
    private readonly aiService: AiContentAnalysisService,
  ) {}

  async processUrlSubmission(
    itemId: string,
    ownerUserId: string,
    url: string,
  ): Promise<void> {
    try {
      await this.itemsService.markProcessing(itemId);
      const fetched = await this.contentFetcher.fetchFromUrl(url);
      await this.runAnalysis(itemId, ownerUserId, fetched);
    } catch (error) {
      this.logger.error(`知識庫網址分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `這則知識庫內容分析失敗了：${this.errorMessage(error)}`,
      );
    }
  }

  async processImageSubmission(
    itemId: string,
    ownerUserId: string,
    image: { data: Buffer; mimeType: string },
  ): Promise<void> {
    try {
      await this.itemsService.markProcessing(itemId);
      await this.runAnalysis(itemId, ownerUserId, {
        sourcePlatform: '圖片',
        image,
      });
    } catch (error) {
      this.logger.error(`知識庫圖片分析失敗 item=${itemId}`, error as Error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `這則知識庫內容分析失敗了：${this.errorMessage(error)}`,
      );
    }
  }

  private async runAnalysis(
    itemId: string,
    ownerUserId: string,
    fetched: FetchedContent,
  ): Promise<void> {
    await this.itemsService.updateSourcePlatform(
      itemId,
      fetched.sourcePlatform,
    );

    const item = await this.itemsService.getByIdInternal(itemId);
    const existingCategories =
      await this.categoriesService.getCategoriesForAi(ownerUserId);
    const result = await this.aiService.analyze({
      sourcePlatform: fetched.sourcePlatform,
      sourceUrl: item.sourceUrl ?? undefined,
      extractedText: fetched.extractedText,
      youtubeUrl: fetched.youtubeUrl,
      image: fetched.image,
      existingCategories,
    });

    const outcome = await this.itemsService.applyAnalysisResult(
      itemId,
      fetched.extractedText,
      result,
    );
    if (outcome.status === 'DONE') {
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `已建立資料，分類為 ${outcome.categoryName}`,
      );
    } else {
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        `這則內容好像沒有適合的分類，建議新增「${outcome.suggestedCategoryName}」分類。\n回覆「新增」建立，或回覆一個你現有的分類名稱來歸類到那裡。`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '分析失敗';
  }
}
