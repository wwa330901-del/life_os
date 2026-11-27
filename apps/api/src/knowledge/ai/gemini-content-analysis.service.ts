import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiContentAnalysisService,
  BrainAnalysis,
  ContentAnalysisInput,
  ContentAnalysisOutcome,
  ContentAnalysisResult,
  KnowledgeFieldType,
} from './ai-content-analysis.interface';

const VALID_FIELD_TYPES: readonly KnowledgeFieldType[] = [
  'TEXT',
  'NUMBER',
  'DATE',
  'SELECT',
  'BOOLEAN',
];

function toFieldType(value: string): KnowledgeFieldType {
  return (VALID_FIELD_TYPES as readonly string[]).includes(value)
    ? (value as KnowledgeFieldType)
    : 'TEXT';
}

/** Kept as a constant (not hardcoded inline at each call site) so bumping to
 * a newer Gemini generation later is a one-line change. 2.5 Flash was
 * originally picked for being cheap/GA/multimodal, but Google stopped
 * granting new API keys access to it (404 "no longer available to new
 * users") — 3.6 Flash is the current stable successor with the same
 * multimodal support. 2026-10-02 起只剩看影片、語音轉文字用 Gemini。 */
export const GEMINI_MODEL = 'gemini-3.6-flash';
const MODEL = GEMINI_MODEL;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    matched: { type: 'boolean' },
    categoryId: { type: 'string' },
    suggestedCategoryName: { type: 'string' },
    suggestedFields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'],
          },
        },
        required: ['name', 'type'],
      },
    },
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    related: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, reason: { type: 'string' } },
        required: ['id', 'reason'],
      },
    },
    eventStartDate: { type: 'string' },
    eventEndDate: { type: 'string' },
    fieldValues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['name', 'value'],
      },
    },
  },
  required: ['matched', 'title', 'summary', 'tags', 'topics'],
};

/** Matches the SDK's internal TextContent/ImageContent/VideoContent shapes
 * (not exported by name from @google/genai, hence redeclared here) closely
 * enough to type-check structurally against `interactions.create`'s `input`. */
type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data?: string; mime_type?: string; uri?: string }
  | { type: 'video'; data?: string; mime_type?: string; uri?: string };

export interface RawAnalysisOutput {
  matched: boolean;
  categoryId?: string;
  suggestedCategoryName?: string;
  suggestedFields?: { name: string; type: string }[];
  title: string;
  summary: string;
  tags: string[];
  fieldValues?: { name: string; value: string }[];
  topics?: string[];
  related?: { id: string; reason: string }[];
  eventStartDate?: string;
  eventEndDate?: string;
}

/** 知識庫內容分析（2026-10-09 起全部用 Gemini）：文字、網頁、圖片、影片。 */
@Injectable()
export class GeminiContentAnalysisService implements AiContentAnalysisService {
  private readonly logger = new Logger(GeminiContentAnalysisService.name);

  async analyze(input: ContentAnalysisInput): Promise<ContentAnalysisOutcome> {
    if (!input.keys.gemini) throw new Error('Gemini 金鑰沒有設定');
    const client = new GoogleGenAI({ apiKey: input.keys.gemini });
    const parts = this.buildInputParts(input);

    let outputText: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const interaction = await client.interactions.create({
        model: MODEL,
        input: parts,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RESPONSE_SCHEMA,
        },
      });
      outputText = interaction.output_text;
      inputTokens = interaction.usage?.total_input_tokens ?? 0;
      outputTokens = interaction.usage?.total_output_tokens ?? 0;
    } catch (error) {
      this.logger.error(
        `Gemini interaction failed for ${input.sourcePlatform} content`,
        error as Error,
      );
      throw error;
    }

    if (!outputText) {
      throw new Error('Gemini interaction returned no output_text');
    }
    const raw = JSON.parse(outputText) as RawAnalysisOutput;
    return {
      result: toAnalysisResult(raw),
      usage: { model: MODEL, inputTokens, outputTokens },
    };
  }

  private buildInputParts(input: ContentAnalysisInput): GeminiInputPart[] {
    const parts: GeminiInputPart[] = [{ type: 'text', text: analysisInstruction(input) }];

    if (input.extractedText) {
      parts.push({
        type: 'text',
        text: `以下是擷取到的內容文字：\n${input.extractedText.slice(0, 20000)}`,
      });
    }
    if (input.youtubeUrl) {
      parts.push({ type: 'video', uri: input.youtubeUrl });
    }
    if (input.image) {
      parts.push({
        type: 'image',
        data: input.image.data.toString('base64'),
        mime_type: input.image.mimeType,
      });
    }
    if (input.video) {
      parts.push({
        type: 'video',
        data: input.video.data.toString('base64'),
        mime_type: input.video.mimeType,
      });
    }

    return parts;
  }
}

/** 分析指示（Claude、Gemini 共用）。 */
export function analysisInstruction(input: ContentAnalysisInput): string {
  const categoriesDescription = input.existingCategories.map((category) => ({
    id: category.id,
    name: category.name,
    fields: category.fields.map((field) => ({
      name: field.name,
      type: field.type,
    })),
  }));

  return [
    '你是「元序」App 知識蒐集中心的內容分析助理。使用者傳來一則要收藏的內容，你的任務：',
    '1. 判斷這則內容最符合下面「現有分類」清單中的哪一個；如果沒有任何一個真的合適，設 matched=false。',
    '2. 若 matched=true：填 categoryId（必須是清單裡的 id），並照該分類的 fields 清單，盡量把看得出來的欄位值填進 fieldValues（陣列，每個元素 {name, value}，name 必須完全對應該分類的欄位名稱；看不出來的欄位就不要放進陣列）。DATE 型態請輸出 "YYYY-MM-DD"；BOOLEAN 型態請輸出 "true" 或 "false"；NUMBER 型態請輸出純數字字串。',
    '3. 若 matched=false：建議一個新的分類名稱（suggestedCategoryName）跟 3-8 個合理的欄位（suggestedFields，每個 {name, type}，type 從 TEXT/NUMBER/DATE/SELECT/BOOLEAN 選），並照你建議的欄位把看得出來的值填進 fieldValues（規則同上）。',
    '4. 一律填 title（簡短標題）、summary（三行以內摘要）、tags（3-6 個關鍵字標籤）。',
    '5. topics：這則屬於哪些「主題」（1-4 個，像大腦裡的節點，例如地點「台南」、類型「咖啡」「展覽」、領域「投資」）。下面「現有主題」裡有意思一樣的就一定要用一模一樣的名字（不要「台南」「台南市」兩個都有），真的沒有才新取，名字要短（2-6 個字）。',
    '6. related：從下面「可能相關的舊收藏」挑出真的有關的（同一個地方、同一件事、同一個主題的延伸，最多 5 則），每則 {id, reason}，reason 用一句短話說為什麼有關（例如「同在台南中西區」）。沒有就給空陣列，不要硬湊。',
    '7. 如果是展覽、活動、市集、演唱會這類有期間的，填 eventStartDate、eventEndDate（"YYYY-MM-DD"，看不出年份就用最接近今天之後的那一年）；不是或看不出來就不要填。',
    '所有輸出一律使用繁體中文。',
    '',
    `來源平台：${input.sourcePlatform}`,
    input.sourceUrl ? `原始網址：${input.sourceUrl}` : null,
    input.extraInstruction ? `使用者這次重新分析的額外指示：${input.extraInstruction}` : null,
    '',
    `今天日期：${new Date().toISOString().slice(0, 10)}`,
    '',
    '現有分類清單（JSON）：',
    JSON.stringify(categoriesDescription),
    '',
    '現有主題（JSON）：',
    JSON.stringify(input.existingTopics ?? []),
    '',
    '可能相關的舊收藏（JSON）：',
    JSON.stringify(input.relatedCandidates ?? []),
  ]
    .filter((line) => line !== null)
    .join('\n');
}

const DATE_RE = /^d{4}-d{2}-d{2}$/;

export function toBrainAnalysis(raw: RawAnalysisOutput): BrainAnalysis {
  const topics = [...new Set((raw.topics ?? []).map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 20))].slice(0, 4);
  return {
    topics,
    related: (raw.related ?? []).filter((r) => r.id).slice(0, 5),
    eventStartDate: raw.eventStartDate && DATE_RE.test(raw.eventStartDate) ? raw.eventStartDate : null,
    eventEndDate: raw.eventEndDate && DATE_RE.test(raw.eventEndDate) ? raw.eventEndDate : null,
  };
}

export function toAnalysisResult(raw: RawAnalysisOutput): ContentAnalysisResult {
  const brain = toBrainAnalysis(raw);
  const fieldValues: Record<string, string> = {};
  for (const entry of raw.fieldValues ?? []) {
    fieldValues[entry.name] = entry.value;
  }
  if (raw.matched && raw.categoryId) {
    return {
      matched: true,
      brain,
      categoryId: raw.categoryId,
      title: raw.title,
      summary: raw.summary,
      tags: raw.tags ?? [],
      fieldValues,
    };
  }

  return {
    matched: false,
    brain,
    suggestedCategoryName: raw.suggestedCategoryName ?? '未分類',
    suggestedFields: (raw.suggestedFields ?? []).map((field) => ({
      name: field.name,
      type: toFieldType(field.type),
    })),
    fieldValues,
    title: raw.title,
    summary: raw.summary,
    tags: raw.tags ?? [],
  };
}

const BRAIN_ONLY_SCHEMA = {
  type: 'object',
  properties: {
    topics: RESPONSE_SCHEMA.properties.topics,
    related: RESPONSE_SCHEMA.properties.related,
    eventStartDate: { type: 'string' },
    eventEndDate: { type: 'string' },
  },
  required: ['topics'],
};

/** 整理舊收藏用（2026-11-27）：不重抓原文，只看標題、摘要、標籤，幫它挑主題、
 * 找相關的、抓活動日期。比完整分析便宜很多。 */
export async function analyzeBrainOnly(
  apiKey: string,
  item: { title: string; summary: string; tags: string[]; facts: string },
  context: { existingTopics: string[]; relatedCandidates: { id: string; title: string; topics: string[] }[] },
): Promise<{ brain: BrainAnalysis; inputTokens: number; outputTokens: number }> {
  const client = new GoogleGenAI({ apiKey });
  const prompt = [
    '你是「元序」知識庫大腦的整理助理。下面是使用者以前存的一則收藏，請幫它：',
    '1. topics：屬於哪些主題（1-4 個，像大腦裡的節點，例如地點「台南」、類型「咖啡」「展覽」、領域「投資」）。「現有主題」裡有意思一樣的一定要用一模一樣的名字，真的沒有才新取，名字 2-6 個字。',
    '2. related：從「其他收藏」挑出真的有關的（最多 5 則），每則 {id, reason}，reason 一句短話。沒有就空陣列，不要硬湊。',
    '3. 如果是有期間的展覽、活動，填 eventStartDate、eventEndDate（"YYYY-MM-DD"），看不出來就不要填。',
    '一律繁體中文。',
    `今天日期：${new Date().toISOString().slice(0, 10)}`,
    '',
    `標題：${item.title}`,
    `摘要：${item.summary}`,
    `標籤：${item.tags.join('、')}`,
    item.facts ? `重點：${item.facts}` : '',
    '',
    `現有主題：${JSON.stringify(context.existingTopics)}`,
    `其他收藏：${JSON.stringify(context.relatedCandidates)}`,
  ].join('\n');
  const interaction = await client.interactions.create({
    model: MODEL,
    input: [{ type: 'text', text: prompt }],
    response_format: { type: 'text', mime_type: 'application/json', schema: BRAIN_ONLY_SCHEMA },
  });
  if (!interaction.output_text) throw new Error('Gemini interaction returned no output_text');
  const raw = JSON.parse(interaction.output_text) as RawAnalysisOutput;
  return {
    brain: toBrainAnalysis(raw),
    inputTokens: interaction.usage?.total_input_tokens ?? 0,
    outputTokens: interaction.usage?.total_output_tokens ?? 0,
  };
}
