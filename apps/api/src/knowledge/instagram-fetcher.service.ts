import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { FetchedContent } from './content-fetcher.service';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;

/** Instagram 網頁版前端本身固定會帶的公開識別碼，不是帳號機密——單純讓請求
 * 看起來像真的瀏覽器在打 instagram.com，而不是一個只帶 cookie、其餘標頭都
 * 空空如也的裸請求（後者更容易被視為可疑）。 */
const IG_APP_ID = '936619743392459';

export const INSTAGRAM_SESSION_EXPIRED_MESSAGE =
  'Instagram 連結讀取失敗，登入 session 可能過期了，需要重新設定（找 AI 開發者處理）。';

/** 知識庫 Instagram 連結分析 (2026-08-06) — a LOGGED-OUT fetch of an IG post
 * comes back as an empty shell (confirmed by direct testing, see
 * `ContentFetcherService`'s original `INSTAGRAM_UNSUPPORTED_MESSAGE` doc
 * comment); this attaches a real, already-authenticated session's
 * `sessionid` cookie instead. Deliberately NOT an automated-login flow —
 * every attempt at that (Playwright browser automation, the
 * `instagram-private-api` package) got flagged as suspicious and blocked
 * by Instagram's anti-bot systems when tried from this app's dev/CI
 * environment, regardless of how correct the credentials were (2026-08-06
 * investigation). A `sessionid` copied out of a real logged-in browser
 * session never triggers that same login-time scrutiny — it's just an
 * ordinary authenticated request, the same as any browser tab open to
 * instagram.com. The tradeoff: this session isn't self-refreshing, so it
 * WILL eventually need updating (a fresh `sessionid` copied out of a
 * browser again) — that's a one-time manual step, not something this
 * service can automate away without hitting the exact same anti-bot wall
 * the automated approaches did. `INSTAGRAM_SESSION_ID` is a plain Render
 * env var, same secret-handling convention as `LINE_CHANNEL_ACCESS_TOKEN`. */
@Injectable()
export class InstagramFetcherService {
  private readonly logger = new Logger(InstagramFetcherService.name);

  get configured(): boolean {
    return Boolean(process.env.INSTAGRAM_SESSION_ID);
  }

  async fetchFromUrl(url: string): Promise<FetchedContent> {
    const sessionId = process.env.INSTAGRAM_SESSION_ID;
    if (!sessionId) {
      throw new Error(INSTAGRAM_SESSION_EXPIRED_MESSAGE);
    }

    const response = await this.get(url, { Cookie: `sessionid=${sessionId}` });
    const html = await response.text();
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogVideo =
      $('meta[property="og:video:secure_url"]').attr('content') ??
      $('meta[property="og:video"]').attr('content');
    const caption = ogDescription ?? ogTitle;

    if (!caption && !ogImage && !ogVideo) {
      // 一樣是空殼——session 可能過期了（不是這則貼文本身有問題，一個空
      // 殼在登入前跟登入 session 失效後看起來完全一樣）。
      throw new Error(INSTAGRAM_SESSION_EXPIRED_MESSAGE);
    }

    if (ogVideo) {
      const { data, mimeType } = await this.fetchBinary(ogVideo);
      return { sourcePlatform: 'IG', extractedText: caption, video: { data, mimeType } };
    }
    if (ogImage) {
      const { data, mimeType } = await this.fetchBinary(ogImage);
      return { sourcePlatform: 'IG', extractedText: caption, image: { data, mimeType } };
    }
    return { sourcePlatform: 'IG', extractedText: caption };
  }

  private async fetchBinary(url: string): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.get(url);
    const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
    return { data: Buffer.from(await response.arrayBuffer()), mimeType };
  }

  private async get(url: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'X-IG-App-ID': IG_APP_ID,
          ...extraHeaders,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`IG 抓取失敗 status=${response.status} url=${url}`);
        throw new Error(INSTAGRAM_SESSION_EXPIRED_MESSAGE);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
