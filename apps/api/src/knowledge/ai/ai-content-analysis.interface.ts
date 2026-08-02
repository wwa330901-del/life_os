export type KnowledgeFieldType =
  'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';

export interface CategoryFieldContext {
  name: string;
  type: KnowledgeFieldType;
}

export interface CategoryContext {
  id: string;
  name: string;
  fields: CategoryFieldContext[];
}

export interface ContentAnalysisInput {
  /** Display label only, e.g. "IG"/"YouTube"/"網頁文章"/"PDF"/"圖片". */
  sourcePlatform: string;
  sourceUrl?: string;
  /** Extracted plain text — article body, PDF text, IG og:meta title/caption, etc. */
  extractedText?: string;
  /** Passed straight through to Gemini's native video understanding. */
  youtubeUrl?: string;
  /** Direct image bytes — a JPG/PNG sent via LINE, or a fetched IG/og:image thumbnail. */
  image?: { data: Buffer; mimeType: string };
  existingCategories: CategoryContext[];
}

export interface ContentAnalysisMatchedResult {
  matched: true;
  categoryId: string;
  title: string;
  summary: string;
  tags: string[];
  /** Keyed by field NAME (not id) — the caller resolves name -> KnowledgeFieldDefinition. */
  fieldValues: Record<string, string>;
}

export interface ContentAnalysisUnmatchedResult {
  matched: false;
  suggestedCategoryName: string;
  suggestedFields: { name: string; type: KnowledgeFieldType }[];
  title: string;
  summary: string;
  tags: string[];
}

export type ContentAnalysisResult =
  ContentAnalysisMatchedResult | ContentAnalysisUnmatchedResult;

export const AI_CONTENT_ANALYSIS_SERVICE = Symbol(
  'AI_CONTENT_ANALYSIS_SERVICE',
);

/** Replaceable AI backend for 知識庫 content analysis — Gemini is the first
 * implementation; a Claude/GPT/local-model one can implement this same
 * interface later without touching any caller. */
export interface AiContentAnalysisService {
  analyze(input: ContentAnalysisInput): Promise<ContentAnalysisResult>;
}
