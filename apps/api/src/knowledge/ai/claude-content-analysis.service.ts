import { Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { agentModel, claudeJson } from '../../ai/claude';
import { AiContentAnalysisService, ContentAnalysisInput, ContentAnalysisOutcome } from './ai-content-analysis.interface';
import { analysisInstruction, GeminiContentAnalysisService, RESPONSE_SCHEMA, toAnalysisResult, type RawAnalysisOutput } from './gemini-content-analysis.service';

const CLAUDE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export const VIDEO_NEEDS_GEMINI_MESSAGE =
  '這則是影片，Claude 看不了影片——請到 App 左側「AI 設定」也貼上 Gemini 金鑰（免費的就可以），影片就會自動分析。';

/** 知識庫內容分析（2026-10-02 改用 Claude）：文字、網頁、圖片用 Claude；影片
 * （YouTube、LINE 傳的影片）Claude 看不了，交給 Gemini。只有 Gemini 金鑰的人
 * 全部照舊用 Gemini。 */
@Injectable()
export class ClaudeContentAnalysisService implements AiContentAnalysisService {
  constructor(private readonly gemini: GeminiContentAnalysisService) {}

  async analyze(input: ContentAnalysisInput): Promise<ContentAnalysisOutcome> {
    const { claude, gemini } = input.keys;
    const hasVideo = Boolean(input.youtubeUrl || input.video);
    const imageOk = !input.image || CLAUDE_IMAGE_TYPES.has(input.image.mimeType);
    if (gemini && (!claude || hasVideo || !imageOk)) return this.gemini.analyze(input);
    if (!claude) throw new Error('沒有 AI 金鑰');
    // 影片但沒有 Gemini 金鑰：有標題/說明文字就先用文字分析，什麼都沒有才請他設 Gemini。
    if (hasVideo && !input.extractedText && !input.image) throw new Error(VIDEO_NEEDS_GEMINI_MESSAGE);

    const content: Anthropic.ContentBlockParam[] = [];
    if (input.image && imageOk) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.image.mimeType as Anthropic.Base64ImageSource['media_type'],
          data: input.image.data.toString('base64'),
        },
      });
    }
    content.push({ type: 'text', text: analysisInstruction(input) });
    if (input.extractedText) {
      content.push({ type: 'text', text: `以下是擷取到的內容文字：\n${input.extractedText.slice(0, 20000)}` });
    }

    const model = agentModel();
    const res = await claudeJson<RawAnalysisOutput>({ apiKey: claude, model, effort: 'low', content, schema: RESPONSE_SCHEMA });
    return {
      result: toAnalysisResult(res.data),
      usage: {
        model,
        inputTokens: res.usage.input,
        outputTokens: res.usage.output,
      },
    };
  }
}
