import Anthropic from '@anthropic-ai/sdk';
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
import { claudeUnavailable } from './ai-errors';

/** 2026-10-02 起 AI 改用 Claude（使用者選「混用」）：要做事的（Agent、規劃、
 * 辨識收據）用 Sonnet 5.5，閒聊和簡單分類用 Haiku 4.5。Gemini 只剩語音轉文字、
 * 看影片（Claude 聽不到聲音、看不了影片）。每個人用自己的 Claude 金鑰
 * （User.claudeApiKey），沒有平台共用金鑰。 */
export const agentModel = () => process.env.AI_AGENT_MODEL || 'claude-sonnet-5-5';
export const lightModel = () => process.env.AI_CHAT_MODEL || 'claude-haiku-4-5';

export type Effort = 'low' | 'medium' | 'high';

/** 沒設 Claude 金鑰時跟使用者說的話。 */
export const needClaudeKey = (what: string) => `${what}需要 AI，請先到 App 左側「AI 設定」貼上你的 Claude 金鑰`;

export function claudeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
}

/** Haiku 4.5 不接受 effort（會 400），也不開思考；Sonnet 5.5 預設就是 adaptive 思考。 */
export function effortConfig(model: string, effort: Effort): { effort?: Effort } {
  return model.startsWith('claude-haiku') ? {} : { effort };
}

/** 各功能原本的工具定義（{type:'function', name, description, parameters}）→ Claude 格式。
 * cacheLast：最後一個工具加快取標記——工具清單是每次請求最大、最不會變的一段。 */
export interface FunctionToolDef {
  name: string;
  description: string;
  parameters?: object;
}

export function toClaudeTools(defs: readonly FunctionToolDef[], cacheLast = false): Anthropic.Tool[] {
  return defs.map((d, i) => ({
    name: d.name,
    description: d.description,
    input_schema: (d.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
    ...(cacheLast && i === defs.length - 1 && { cache_control: { type: 'ephemeral' as const } }),
  }));
}

export interface TokenUsage {
  /** 全部輸入（含快取讀寫）。 */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function addUsage(total: TokenUsage, usage: Anthropic.Usage): TokenUsage {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  total.input += usage.input_tokens + cacheRead + cacheWrite;
  total.output += usage.output_tokens;
  total.cacheRead += cacheRead;
  total.cacheWrite += cacheWrite;
  return total;
}

/** 給 AiUsageService.record 的 token 欄位。 */
export const usageFields = (u: TokenUsage) => ({
  inputTokens: u.input,
  outputTokens: u.output,
  cacheReadTokens: u.cacheRead,
  cacheWriteTokens: u.cacheWrite,
});

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** 呼叫 Claude；額度/付款/金鑰/過載轉成 AiUnavailableError，其他照原樣丟。 */
export async function callClaude(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(params);
  } catch (error) {
    throw claudeUnavailable(error) ?? error;
  }
}

/** 一次問答拿結構化 JSON（output_config.format，Claude 保證照 schema 輸出）。 */
export async function claudeJson<T>(params: {
  apiKey: string;
  model?: string;
  effort?: Effort;
  system?: string;
  content: string | Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; text: string; model: string; usage: TokenUsage }> {
  const model = params.model ?? agentModel();
  const message = await callClaude(claudeClient(params.apiKey), {
    model,
    max_tokens: params.maxTokens ?? 16000,
    ...(params.system && { system: params.system }),
    messages: [{ role: 'user', content: params.content }],
    output_config: {
      ...effortConfig(model, params.effort ?? 'medium'),
      format: { type: 'json_schema', schema: transformJSONSchema(params.schema) },
    },
  });
  const usage = addUsage(emptyUsage(), message.usage);
  if (message.stop_reason === 'refusal') throw new Error('Claude 拒絕回答這個請求（refusal）');
  if (message.stop_reason === 'max_tokens') throw new Error('Claude 回覆太長被截斷（max_tokens）');
  const text = textOf(message);
  if (!text) throw new Error('Claude 沒有回傳內容');
  return { data: JSON.parse(text) as T, text, model, usage };
}

/** 一次問答拿純文字。 */
export async function claudeText(params: {
  apiKey: string;
  model?: string;
  effort?: Effort;
  system?: string;
  content: string | Anthropic.ContentBlockParam[];
  maxTokens?: number;
}): Promise<{ text: string; model: string; usage: TokenUsage }> {
  const model = params.model ?? agentModel();
  const message = await callClaude(claudeClient(params.apiKey), {
    model,
    max_tokens: params.maxTokens ?? 16000,
    ...(params.system && { system: params.system }),
    messages: [{ role: 'user', content: params.content }],
    output_config: effortConfig(model, params.effort ?? 'medium'),
  });
  return { text: textOf(message), model, usage: addUsage(emptyUsage(), message.usage) };
}
