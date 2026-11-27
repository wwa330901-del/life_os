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
  /** The calling user's own keys — every call bills to their own account,
   * never a shared platform key. 2026-10-02: Claude does text/images; Gemini
   * only videos (Claude can't watch video). At least one must be set. */
  keys: { claude: string | null; gemini: string | null };
  /** Display label only, e.g. "IG"/"YouTube"/"網頁文章"/"PDF"/"圖片". */
  sourcePlatform: string;
  sourceUrl?: string;
  /** Extracted plain text — article body, PDF text, IG og:meta title/caption, etc. */
  extractedText?: string;
  /** Passed straight through to Gemini's native video understanding. */
  youtubeUrl?: string;
  /** Direct image bytes — a JPG/PNG sent via LINE, or a fetched IG/og:image thumbnail. */
  image?: { data: Buffer; mimeType: string };
  /** Direct video bytes — a screen recording/clip sent via LINE. Distinct
   * from `youtubeUrl` (Gemini watches that by reference, no upload needed);
   * this is inline video data, same shape as `image`. */
  video?: { data: Buffer; mimeType: string };
  existingCategories: CategoryContext[];
  /** 知識庫大腦（2026-11-27）：使用者現有的主題點名稱，AI 優先沿用。 */
  existingTopics?: string[];
  /** 可能相關的舊收藏（最近的一批），AI 從裡面挑真的有關的連線。 */
  relatedCandidates?: { id: string; title: string; topics: string[] }[];
  /** 使用者在「重新分析」時額外輸入的指示（例如「分析多一點」），只在
   * 重新分析時才可能有值——第一次分析永遠是 undefined。 */
  extraInstruction?: string;
}

/** 大腦要用的：主題、相關的舊收藏、活動日期（YYYY-MM-DD，沒有就 null）。 */
export interface BrainAnalysis {
  topics: string[];
  related: { id: string; reason: string }[];
  eventStartDate: string | null;
  eventEndDate: string | null;
}

export interface ContentAnalysisMatchedResult {
  brain: BrainAnalysis;
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
  brain: BrainAnalysis;
  suggestedCategoryName: string;
  suggestedFields: { name: string; type: KnowledgeFieldType }[];
  /** 照 suggestedFields 填的值（2026-11-27 起不再問使用者，直接建分類）。 */
  fieldValues: Record<string, string>;
  title: string;
  summary: string;
  tags: string[];
}

export type ContentAnalysisResult =
  ContentAnalysisMatchedResult | ContentAnalysisUnmatchedResult;

export interface ContentAnalysisUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ContentAnalysisOutcome {
  result: ContentAnalysisResult;
  usage: ContentAnalysisUsage;
}

export const AI_CONTENT_ANALYSIS_SERVICE = Symbol(
  'AI_CONTENT_ANALYSIS_SERVICE',
);

/** Replaceable AI backend for 知識庫 content analysis — Gemini is the first
 * implementation; a Claude/GPT/local-model one can implement this same
 * interface later without touching any caller. */
export interface AiContentAnalysisService {
  analyze(input: ContentAnalysisInput): Promise<ContentAnalysisOutcome>;
}
