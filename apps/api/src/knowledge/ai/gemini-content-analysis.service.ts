import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiContentAnalysisService,
  ContentAnalysisInput,
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
 * a newer Gemini generation later is a one-line change — see 大系統 doc for
 * why 2.5 Flash was picked over the newer 3.x Flash tiers: materially
 * cheaper, still fully GA/multimodal, and this module's outputs (short
 * summaries/tags/field extraction) don't need frontier-tier reasoning. */
const MODEL = 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
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
  required: ['matched', 'title', 'summary', 'tags'],
};

/** Matches the SDK's internal TextContent/ImageContent/VideoContent shapes
 * (not exported by name from @google/genai, hence redeclared here) closely
 * enough to type-check structurally against `interactions.create`'s `input`. */
type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data?: string; mime_type?: string; uri?: string }
  | { type: 'video'; data?: string; mime_type?: string; uri?: string };

interface RawGeminiOutput {
  matched: boolean;
  categoryId?: string;
  suggestedCategoryName?: string;
  suggestedFields?: { name: string; type: string }[];
  title: string;
  summary: string;
  tags: string[];
  fieldValues?: { name: string; value: string }[];
}

@Injectable()
export class GeminiContentAnalysisService implements AiContentAnalysisService {
  private readonly logger = new Logger(GeminiContentAnalysisService.name);
  private readonly client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY ?? '',
  });

  async analyze(input: ContentAnalysisInput): Promise<ContentAnalysisResult> {
    const parts = this.buildInputParts(input);

    let outputText: string | undefined;
    try {
      const interaction = await this.client.interactions.create({
        model: MODEL,
        input: parts,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RESPONSE_SCHEMA,
        },
      });
      outputText = interaction.output_text;
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
    const raw = JSON.parse(outputText) as RawGeminiOutput;
    return this.toResult(raw);
  }

  private buildInputParts(input: ContentAnalysisInput): GeminiInputPart[] {
    const categoriesDescription = input.existingCategories.map((category) => ({
      id: category.id,
      name: category.name,
      fields: category.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
    }));

    const instruction = [
      '你是「元序」App 知識蒐集中心的內容分析助理。使用者傳來一則要收藏的內容，你的任務：',
      '1. 判斷這則內容最符合下面「現有分類」清單中的哪一個；如果沒有任何一個真的合適，設 matched=false。',
      '2. 若 matched=true：填 categoryId（必須是清單裡的 id），並照該分類的 fields 清單，盡量把看得出來的欄位值填進 fieldValues（陣列，每個元素 {name, value}，name 必須完全對應該分類的欄位名稱；看不出來的欄位就不要放進陣列）。DATE 型態請輸出 "YYYY-MM-DD"；BOOLEAN 型態請輸出 "true" 或 "false"；NUMBER 型態請輸出純數字字串。',
      '3. 若 matched=false：建議一個新的分類名稱（suggestedCategoryName）跟 3-8 個合理的欄位（suggestedFields，每個 {name, type}，type 從 TEXT/NUMBER/DATE/SELECT/BOOLEAN 選）。',
      '4. 一律填 title（簡短標題）、summary（三行以內摘要）、tags（3-6 個關鍵字標籤）。',
      '所有輸出一律使用繁體中文。',
      '',
      `來源平台：${input.sourcePlatform}`,
      input.sourceUrl ? `原始網址：${input.sourceUrl}` : null,
      '',
      '現有分類清單（JSON）：',
      JSON.stringify(categoriesDescription),
    ]
      .filter((line) => line !== null)
      .join('\n');

    const parts: GeminiInputPart[] = [{ type: 'text', text: instruction }];

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

    return parts;
  }

  private toResult(raw: RawGeminiOutput): ContentAnalysisResult {
    if (raw.matched && raw.categoryId) {
      const fieldValues: Record<string, string> = {};
      for (const entry of raw.fieldValues ?? []) {
        fieldValues[entry.name] = entry.value;
      }
      return {
        matched: true,
        categoryId: raw.categoryId,
        title: raw.title,
        summary: raw.summary,
        tags: raw.tags ?? [],
        fieldValues,
      };
    }

    return {
      matched: false,
      suggestedCategoryName: raw.suggestedCategoryName ?? '未分類',
      suggestedFields: (raw.suggestedFields ?? []).map((field) => ({
        name: field.name,
        type: toFieldType(field.type),
      })),
      title: raw.title,
      summary: raw.summary,
      tags: raw.tags ?? [],
    };
  }
}
