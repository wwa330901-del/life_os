import { AiRateLimitedError, isRateLimitError, withModelFallback } from './gemini-rate-limit';

const limit = (per: 'minute' | 'day') =>
  Object.assign(new Error(`429 Rate limit exceeded for model x (limit: 5 requests per ${per} on Free Tier).`), { status: 429 });

describe('withModelFallback', () => {
  it('主要模型成功就用主要模型', async () => {
    await expect(withModelFallback('a', 'b', async (m) => m)).resolves.toEqual({ result: 'a', model: 'a' });
  });

  it('主要模型額度用完換備用模型', async () => {
    const out = await withModelFallback('a', 'b', async (m) => {
      if (m === 'a') throw limit('minute');
      return m;
    });
    expect(out).toEqual({ result: 'b', model: 'b' });
  });

  it('兩個都用完丟 AiRateLimitedError，分得出今天還是這分鐘', async () => {
    const minute = await withModelFallback('a', 'b', async () => {
      throw limit('minute');
    }).catch((e) => e);
    expect(minute).toBeInstanceOf(AiRateLimitedError);
    expect(minute.daily).toBe(false);
    const day = await withModelFallback('a', 'b', async () => {
      throw limit('day');
    }).catch((e) => e);
    expect(day.daily).toBe(true);
  });

  it('其他錯誤照原樣丟出，不換模型', async () => {
    const calls: string[] = [];
    const err = await withModelFallback('a', 'b', async (m) => {
      calls.push(m);
      throw new Error('500 internal');
    }).catch((e) => e);
    expect(err).not.toBeInstanceOf(AiRateLimitedError);
    expect(isRateLimitError(err)).toBe(false);
    expect(calls).toEqual(['a']);
  });
});
