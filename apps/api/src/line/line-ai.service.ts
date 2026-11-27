import { Injectable, Logger } from '@nestjs/common';
import { ReceiptReaderService, receiptToAgentText } from './receipt-reader.service';
import { SYSTEM_TROUBLE_MESSAGE } from '../error-report/system-trouble';
import { aiUnavailableMessage, AiUnavailableError } from '../ai/ai-errors';
import { needClaudeKey } from '../ai/claude';
import { KnowledgeItemsService } from '../knowledge/knowledge-items.service';
import { KnowledgeAnalysisPipeline } from '../knowledge/knowledge-analysis-pipeline.service';
import { UsersService } from '../users/users.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import { LineReplyService } from './line-reply.service';
import { LineKnowledgeService } from './line-knowledge.service';
import { sourceKeyForBytes } from '../knowledge/knowledge-source-key';
import { CONFIRM_BUTTONS, LEADING_SEPARATORS } from './line-shared';

/** LINE 交給 AI：萬用 AI 對話（含確認按鈕）、「查詢」、照片（收據／一般照片）。 */
@Injectable()
export class LineAiService {
  private readonly logger = new Logger(LineAiService.name);
  constructor(
    private readonly knowledgeItemsService: KnowledgeItemsService,
    private readonly knowledgeAnalysisPipeline: KnowledgeAnalysisPipeline,
    private readonly usersService: UsersService,
    private readonly aiAgent: AiAgentService,
    private readonly receiptReader: ReceiptReaderService,
    private readonly out: LineReplyService,
    private readonly lineKnowledge: LineKnowledgeService,
  ) {}

  /** LINE image messages carry no URL — the bytes have to be pulled from
   * LINE's separate content-hosting API using the message id. */
  async handleImageMessage(link: LineAccountLink, messageId: string | undefined, replyToken: string) {
    if (!messageId) return;
    const linkId = link.id;
    const userId = link.userId;
    try {
      const data = await this.out.fetchLineMessageContent(messageId);
      // 拍收據記帳（2026-10-01）：是單據就交給萬用 AI 記帳，不進知識庫。
      const apiKey = (await this.usersService.findById(userId))?.claudeApiKey ?? null;
      let receipt: Awaited<ReturnType<ReceiptReaderService['read']>> = null;
      try {
        receipt = apiKey ? await this.receiptReader.read(userId, apiKey, data) : null;
      } catch (error) {
        if (!(error instanceof AiUnavailableError)) throw error;
        await this.out.reply(replyToken, aiUnavailableMessage(error));
        return;
      }
      if (apiKey && receipt) {
        const heading = `🧾 收據：${receipt.merchant ? `${receipt.merchant} ` : ''}${receipt.total.toLocaleString('en-US')} 元`;
        const handled = await this.out.replyPrefix.run(heading, () =>
          this.tryAiAgent(link, receiptToAgentText(receipt), replyToken, apiKey, true),
        );
        if (!handled) {
          await this.out.reply(
            replyToken,
            `${heading}\n\n${SYSTEM_TROUBLE_MESSAGE}\n先直接打「${receipt.items ?? receipt.merchant ?? '消費'} ${receipt.total}」也可以記帳。`,
          );
        }
        return;
      }
      const sourceKey = sourceKeyForBytes(data);
      if (await this.lineKnowledge.replyIfDuplicate(userId, sourceKey, replyToken)) return;
      const item = await this.knowledgeItemsService.createPending(userId, {
        sourcePlatform: '圖片',
        sourceKey,
      });
      await this.out.reply(replyToken, '收到，分析中，好了會再傳訊息通知你。');
      void this.knowledgeAnalysisPipeline.processImageSubmission(
        item.id,
        userId,
        {
          data,
          mimeType: 'image/jpeg',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch LINE image content for link=${linkId}`,
        error as Error,
      );
      await this.out.reply(replyToken, '圖片下載失敗，請再傳一次看看。');
    }
  }

  /** "查詢 <問題>" — 2026-10-02 起交給萬用 AI（跟直接講話一樣），不再有獨立的
   * 查詢 AI。Requires the explicit "查詢" prefix (not a no-match fallback) — the
   * user's own choice, to avoid an ordinary unrecognized command silently
   * turning into an AI call. */
  async handleAiQuery(link: LineAccountLink, text: string, replyToken: string): Promise<void> {
    const question = text.replace(/^查詢/, '').replace(LEADING_SEPARATORS, '').trim();
    if (!question) {
      await this.out.reply(replyToken, '請在「查詢」後面接你想問的問題，例如「查詢 這個月餐飲花多少」。');
      return;
    }

    const apiKey = (await this.usersService.findById(link.userId))?.claudeApiKey ?? null;
    if (!apiKey) {
      await this.out.reply(replyToken, needClaudeKey('查詢'));
      return;
    }
    if (!(await this.tryAiAgent(link, question, replyToken, apiKey, true))) {
      await this.out.reply(replyToken, `這次查詢失敗了。${SYSTEM_TROUBLE_MESSAGE}`);
    }
  }

  // --- 代辦事項（個人）---

  /** Returns false (without replying) when the AI says the message isn't
   * something it can act on, or fails — the caller falls through. */
  async tryAiAgent(link: LineAccountLink, text: string, replyToken: string, apiKey: string, forceAgent = false): Promise<boolean> {
    if (link.lineUserId) void this.out.showTyping(link.lineUserId);
    try {
      const result = await this.aiAgent.handleLine({ link, apiKey, text, forceAgent });
      if (!result.handled) return false;
      if (result.needsConfirmation) {
        // 要確認的事（記帳猜帳戶、借錢、刪除…）：給按鈕，不用打字回「對」
        await this.out.replyWithButtons(replyToken, result.reply, CONFIRM_BUTTONS);
      } else {
        await this.out.reply(replyToken, result.reply);
      }
      return true;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        await this.out.reply(replyToken, aiUnavailableMessage(error));
        return true;
      }
      // AiAgentService 已經 logger.error（→ 通知管理員）；記下來，固定指令也
      // 接不住時回「已通知管理員」而不是「看不懂」。
      const state = this.out.eventState.getStore();
      if (state) state.aiFailed = true;
      return false;
    }
  }



  // --- 行事曆 ---
}
