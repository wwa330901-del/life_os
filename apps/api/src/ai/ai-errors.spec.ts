import Anthropic from '@anthropic-ai/sdk';
import { aiUnavailableMessage, AiUnavailableError, claudeUnavailable, geminiUnavailable, isBillingError } from './ai-errors';

const claudeError = (status: number, type: string, message = 'x') =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, message, new Headers());

describe('claudeUnavailable', () => {
  it('付款問題（402 billing_error、餘額不足）→ billing', () => {
    expect(claudeUnavailable(claudeError(402, 'billing_error'))?.reason).toBe('billing');
    expect(claudeUnavailable(claudeError(400, 'invalid_request_error', 'Your credit balance is too low'))?.reason).toBe('billing');
  });

  it('金鑰無效 → invalid_key；429 → minute；529 → busy', () => {
    expect(claudeUnavailable(claudeError(401, 'authentication_error'))?.reason).toBe('invalid_key');
    expect(claudeUnavailable(claudeError(429, 'rate_limit_error'))?.reason).toBe('minute');
    expect(claudeUnavailable(claudeError(529, 'overloaded_error'))?.reason).toBe('busy');
  });

  it('其他錯誤（壞掉的請求、不是 API 錯誤）→ null，照一般錯誤通報', () => {
    expect(claudeUnavailable(claudeError(400, 'invalid_request_error', 'messages: bad'))).toBeNull();
    expect(claudeUnavailable(new Error('boom'))).toBeNull();
  });
});

describe('geminiUnavailable', () => {
  it('402 → billing、每天額度 → daily、每分鐘 → minute', () => {
    expect(geminiUnavailable(Object.assign(new Error('402 API error occurred'), { status: 402 }))?.reason).toBe('billing');
    expect(geminiUnavailable(Object.assign(new Error('429 limit: 20 requests per day'), { status: 429 }))?.reason).toBe('daily');
    expect(geminiUnavailable(Object.assign(new Error('429 limit: 5 requests per minute'), { status: 429 }))?.reason).toBe('minute');
    expect(geminiUnavailable(new Error('500 internal'))).toBeNull();
  });
});

describe('aiUnavailableMessage', () => {
  it('付款問題說要去哪裡儲值', () => {
    expect(aiUnavailableMessage(new AiUnavailableError('billing', 'claude', 'x'))).toContain('console.anthropic.com');
    expect(aiUnavailableMessage(new AiUnavailableError('billing', 'gemini', 'x'))).toContain('aistudio.google.com');
  });

  it('isBillingError 認得錯誤通報裡的文字', () => {
    expect(isBillingError('402 API error occurred')).toBe(true);
    expect(isBillingError('500 internal')).toBe(false);
  });
});
