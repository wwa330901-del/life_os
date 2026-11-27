import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { KnowledgeItemsService } from './knowledge-items.service';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import {
  ContentFetcherService,
  FetchedContent,
  INSTAGRAM_UNSUPPORTED_MESSAGE,
} from './content-fetcher.service';
import { SYSTEM_TROUBLE_MESSAGE } from '../error-report/system-trouble';
import { SupabaseStorageService } from './supabase-storage.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AiUsageService } from './ai-usage.service';
import { analyzeBrainOnly, GEMINI_MODEL } from './ai/gemini-content-analysis.service';
import { AI_CONTENT_ANALYSIS_SERVICE } from './ai/ai-content-analysis.interface';
import type { AiContentAnalysisService } from './ai/ai-content-analysis.interface';
import { AiUsageStatus } from '../../generated/prisma/client.js';
import { aiUnavailableMessage, geminiUnavailable } from '../ai/ai-errors';
import { KnowledgeBrainService } from './knowledge-brain.service';

const NO_API_KEY_MESSAGE =
  '你還沒有設定自己的 AI 金鑰，請先到 App 的「AI 設定」貼上你的 Gemini 金鑰才能使用知識庫分析功能（知識庫只用 Gemini，免費的金鑰就可以）。';

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
    private readonly storage: SupabaseStorageService,
    private readonly lineNotifier: LineNotifierService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly aiUsageService: AiUsageService,
    private readonly brain: KnowledgeBrainService,
    @Inject(AI_CONTENT_ANALYSIS_SERVICE)
    private readonly aiService: AiContentAnalysisService,
  ) {}

  async processUrlSubmission(
    itemId: string,
    ownerUserId: string,
    url: string,
  ): Promise<void> {
    try {
      const keys = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      const fetched = await this.contentFetcher.fetchFromUrl(url);
      await this.runAnalysis(itemId, ownerUserId, keys, fetched);
    } catch (error) {
      this.logFailure(`知識庫網址分析失敗 item=${itemId}`, error);
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
      const keys = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.persistSourceFile(itemId, image.data, image.mimeType, 'jpg');
      await this.runAnalysis(itemId, ownerUserId, keys, {
        sourcePlatform: '圖片',
        image,
      });
    } catch (error) {
      this.logFailure(`知識庫圖片分析失敗 item=${itemId}`, error);
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
      const keys = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.runAnalysis(itemId, ownerUserId, keys, {
        sourcePlatform: '貼上文字',
        extractedText: text,
      });
    } catch (error) {
      this.logFailure(`知識庫文字分析失敗 item=${itemId}`, error);
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
      const keys = await this.requireApiKey(ownerUserId);
      await this.itemsService.markProcessing(itemId);
      await this.persistSourceFile(itemId, video.data, video.mimeType, 'mp4');
      await this.runAnalysis(itemId, ownerUserId, keys, {
        sourcePlatform: '影片',
        video,
      });
    } catch (error) {
      this.logFailure(`知識庫影片分析失敗 item=${itemId}`, error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(
        ownerUserId,
        this.userFacingMessage(error),
      );
    }
  }

  /** 重新分析 (2026-08-06) — 從這則資料原本存下來的來源（圖片/影片走
   * Supabase Storage，連結重新抓一次，純文字直接重用 rawContent）重新跑
   * 一次分析，可選一段額外指示（例如「分析多一點」）。跟一般的
   * process*Submission 系列同一套「自己吃掉錯誤、用 markFailed + LINE 通知
   * 收尾」的規則，但這裡是使用者主動觸發（不是 LINE webhook 的 fire-and-
   * forget），所以呼叫端（HTTP controller）拿得到這個 Promise，可以選擇
   * await 或不 await，這個方法本身不管哪種都不會把錯誤丟回去。 */
  async reanalyze(itemId: string, callerId: string, extraInstruction?: string): Promise<void> {
    const item = await this.itemsService.getByIdInternal(itemId);
    if (item.ownerUserId !== callerId) {
      throw new ForbiddenException('這不是你的知識庫資料');
    }

    try {
      const keys = await this.requireApiKey(callerId);
      await this.itemsService.markProcessing(itemId);
      const fetched = await this.resolveSourceForReanalysis(item);
      await this.runAnalysis(itemId, callerId, keys, fetched, extraInstruction);
    } catch (error) {
      this.logFailure(`知識庫重新分析失敗 item=${itemId}`, error);
      await this.itemsService.markFailed(itemId, this.errorMessage(error));
      await this.lineNotifier.notifyByUser(callerId, this.userFacingMessage(error));
    }
  }

  private async resolveSourceForReanalysis(item: {
    sourceFilePath: string | null;
    sourceUrl: string | null;
    sourcePlatform: string | null;
    rawContent: string | null;
  }): Promise<FetchedContent> {
    if (item.sourceFilePath) {
      const { data, contentType } = await this.storage.download(item.sourceFilePath);
      return contentType.startsWith('video/')
        ? { sourcePlatform: item.sourcePlatform ?? '影片', video: { data, mimeType: contentType } }
        : { sourcePlatform: item.sourcePlatform ?? '圖片', image: { data, mimeType: contentType } };
    }
    if (item.sourceUrl) {
      return this.contentFetcher.fetchFromUrl(item.sourceUrl);
    }
    if (item.rawContent) {
      return { sourcePlatform: item.sourcePlatform ?? '貼上文字', extractedText: item.rawContent };
    }
    throw new Error('這則資料沒有原始內容可以重新分析');
  }

  /** Best-effort — a Storage failure shouldn't fail the whole analysis (the
   * feature worked fine before this existed), it just means "重新分析"/
   * "顯示來源" won't be available for this particular item afterward. */
  private async persistSourceFile(
    itemId: string,
    data: Buffer,
    mimeType: string,
    extension: string,
  ): Promise<void> {
    if (!this.storage.configured) return;
    const path = `${itemId}.${extension}`;
    try {
      await this.storage.upload(path, data, mimeType);
      await this.itemsService.setSourceFilePath(itemId, path);
    } catch (error) {
      this.logger.warn(`知識庫原始檔存檔失敗 item=${itemId}: ${error}`);
    }
  }

  /** The "no API key" error is already a complete, friendly instruction —
   * everything else gets a generic wrapper so a raw technical message
   * (e.g. "Fetch failed with status 404") doesn't show up unexplained. */
  private userFacingMessage(error: unknown): string {
    const unavailable = this.unavailable(error);
    if (unavailable) return aiUnavailableMessage(unavailable);
    const message = this.errorMessage(error);
    // 使用者自己能處理的照實說；其他（含 IG session 過期）是系統問題，細節
    // 已經 logger.error 通知管理員，使用者只看到「已通知管理員」。
    return message === NO_API_KEY_MESSAGE || message === INSTAGRAM_UNSUPPORTED_MESSAGE
      ? message
      : `這則知識庫內容分析失敗了。${SYSTEM_TROUBLE_MESSAGE}`;
  }

  private unavailable(error: unknown) {
    return geminiUnavailable(error);
  }

  /** 使用者自己能處理的（沒金鑰、額度用完）只記 warn，其他才通知管理員。 */
  private logFailure(label: string, error: unknown) {
    const message = this.errorMessage(error);
    if (this.unavailable(error) || message === NO_API_KEY_MESSAGE) {
      this.logger.warn(`${label}：${message}`);
    } else {
      this.logger.error(label, error as Error);
    }
  }

  private async requireApiKey(userId: string): Promise<{ claude: string | null; gemini: string | null }> {
    const user = await this.usersService.findById(userId);
    // 知識庫（2026-10-09 起）全部用 Gemini，只看 Gemini 金鑰。
    if (!user?.geminiApiKey) {
      throw new Error(NO_API_KEY_MESSAGE);
    }
    return { claude: user.claudeApiKey, gemini: user.geminiApiKey };
  }

  private async runAnalysis(
    itemId: string,
    ownerUserId: string,
    keys: { claude: string | null; gemini: string | null },
    fetched: FetchedContent,
    extraInstruction?: string,
  ): Promise<void> {
    await this.itemsService.updateSourcePlatform(
      itemId,
      fetched.sourcePlatform,
    );

    const item = await this.itemsService.getByIdInternal(itemId);
    const existingCategories =
      await this.categoriesService.getCategoriesForAi(ownerUserId);
    const brainContext = await this.brain.aiContext(ownerUserId, itemId);

    const startedAt = Date.now();
    const outcome = await this.aiService
      .analyze({
        keys,
        sourcePlatform: fetched.sourcePlatform,
        sourceUrl: item.sourceUrl ?? undefined,
        extractedText: fetched.extractedText,
        youtubeUrl: fetched.youtubeUrl,
        image: fetched.image,
        video: fetched.video,
        existingCategories,
        ...brainContext,
        extraInstruction,
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

    await this.itemsService.applyAnalysisResult(
      itemId,
      fetched.extractedText,
      outcome.result,
    );
    const linked = await this.brain.applyBrain(itemId, ownerUserId, outcome.result.brain);
    await this.lineNotifier.notifyByUser(
      ownerUserId,
      this.brain.savedMessage(outcome.result.title, linked, outcome.result.brain.eventEndDate),
    );
  }

  private organizing = new Set<string>();

  /** 「整理舊收藏」（2026-11-27）：大腦上線前存的東西只有一個舊分類當主題、沒有
   * 連線。這裡一則一則讓 AI 補主題、找相關的、抓活動日期（只看標題摘要，不重抓
   * 原文，很便宜）。整理過的記在 SystemAlertLog（kb-organized:<id>），不會重做。
   * 背景跑，做完 LINE 通知。回傳要整理幾則。 */
  async organizeOld(userId: string): Promise<{ queued: number }> {
    if (this.organizing.has(userId)) return { queued: 0 };
    const user = await this.usersService.findById(userId);
    if (!user?.geminiApiKey) throw new Error(NO_API_KEY_MESSAGE);
    const items = await this.prisma.knowledgeItem.findMany({
      where: { ownerUserId: userId, status: 'DONE' },
      orderBy: { createdAt: 'asc' },
      include: { fieldValues: { include: { definition: true, option: true } } },
    });
    const done = new Set(
      (await this.prisma.systemAlertLog.findMany({
        where: { key: { in: items.map((i) => `kb-organized:${i.id}`) } },
        select: { key: true },
      })).map((r) => r.key.slice('kb-organized:'.length)),
    );
    const todo = items.filter((i) => !done.has(i.id)).slice(0, 200);
    if (!todo.length) return { queued: 0 };
    this.organizing.add(userId);
    void (async () => {
      let linked = 0;
      let ok = 0;
      try {
        for (const item of todo) {
          try {
            const facts = item.fieldValues
              .map((v) => {
                const value = v.textValue ?? v.option?.label ?? v.numberValue ?? v.dateValue?.toISOString().slice(0, 10) ?? v.booleanValue;
                return value === null || value === undefined ? null : `${v.definition.name}：${value}`;
              })
              .filter(Boolean)
              .join('；');
            const context = await this.brain.aiContext(userId, item.id);
            const startedAt = Date.now();
            const res = await analyzeBrainOnly(
              user.geminiApiKey!,
              { title: item.title ?? '未命名', summary: item.summary ?? '', tags: item.tags, facts },
              context,
            );
            await this.aiUsageService.record({
              userId,
              feature: 'knowledge',
              model: GEMINI_MODEL,
              inputTokens: res.inputTokens,
              outputTokens: res.outputTokens,
              durationMs: Date.now() - startedAt,
              status: AiUsageStatus.SUCCESS,
            });
            // 舊的活動日期（從欄位搬過來的）AI 沒抓到就保留。
            const brain = {
              ...res.brain,
              eventStartDate: res.brain.eventStartDate ?? item.eventStartDate?.toISOString().slice(0, 10) ?? null,
              eventEndDate: res.brain.eventEndDate ?? item.eventEndDate?.toISOString().slice(0, 10) ?? null,
            };
            const r = await this.brain.applyBrain(item.id, userId, brain);
            linked += r.linked;
            ok += 1;
            await this.prisma.systemAlertLog.create({ data: { key: `kb-organized:${item.id}` } }).catch(() => undefined);
          } catch (error) {
            if (this.unavailable(error)) throw error;
            this.logger.warn(`整理舊收藏失敗 item=${item.id}: ${this.errorMessage(error)}`);
          }
        }
        await this.lineNotifier.notifyByUser(userId, `🧠 大腦整理好了：${ok} 則舊收藏都接上主題，找到 ${linked} 條關聯。到 App 的知識庫看大腦地圖吧！`);
      } catch (error) {
        this.logFailure('整理舊收藏中斷', error);
        await this.lineNotifier.notifyByUser(userId, `大腦整理到一半停了（已整理 ${ok} 則）：${this.userFacingMessage(error)}
之後再按一次「整理舊收藏」會從沒整理的繼續。`);
      } finally {
        this.organizing.delete(userId);
      }
    })();
    return { queued: todo.length };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '分析失敗';
  }
}
