import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';

/** A browser-like User-Agent — several sites (IG included) return a stripped
 * or blocked response to the default Node fetch UA. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15000;

export interface FetchedContent {
  sourcePlatform: string;
  extractedText?: string;
  youtubeUrl?: string;
  image?: { data: Buffer; mimeType: string };
}

/** Confirmed by direct testing (2026-08-03): a logged-out fetch of an
 * Instagram reel/post — even Instagram's own "public embed" page, meant for
 * third-party embedding — comes back as an empty shell with no caption,
 * video, or thumbnail at all. This isn't a "scrape harder" problem, it's a
 * platform-level block with no unauthenticated way around it, so don't
 * bother trying — tell the user to send a screenshot instead (the image
 * pipeline actually sees real content). */
export const INSTAGRAM_UNSUPPORTED_MESSAGE =
  'Instagram 連結沒辦法自動分析（Instagram 擋掉了沒有登入的存取），麻煩改成把畫面截圖傳給我，我可以直接看截圖分析。';

export function isInstagramUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('instagram.com');
  } catch {
    return false;
  }
}

@Injectable()
export class ContentFetcherService {
  async fetchFromUrl(url: string): Promise<FetchedContent> {
    const host = this.safeHost(url);

    if (host && (host.includes('youtube.com') || host.includes('youtu.be'))) {
      return { sourcePlatform: 'YouTube', youtubeUrl: url };
    }
    if (isInstagramUrl(url)) {
      throw new Error(INSTAGRAM_UNSUPPORTED_MESSAGE);
    }

    const response = await this.get(url);
    const contentType = response.headers.get('content-type') ?? '';

    if (
      contentType.includes('application/pdf') ||
      url.toLowerCase().endsWith('.pdf')
    ) {
      return this.extractPdf(await response.arrayBuffer());
    }
    if (contentType.startsWith('image/') || /\.(jpe?g|png)$/i.test(url)) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        sourcePlatform: '圖片',
        image: {
          data: buffer,
          mimeType: contentType.startsWith('image/')
            ? contentType
            : 'image/jpeg',
        },
      };
    }

    return this.extractArticle(await response.text());
  }

  private async extractPdf(bytes: ArrayBuffer): Promise<FetchedContent> {
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const result = await parser.getText();
      return { sourcePlatform: 'PDF', extractedText: result.text };
    } finally {
      await parser.destroy();
    }
  }

  private extractArticle(html: string): FetchedContent {
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, aside, noscript').remove();

    const container = $('article').length
      ? $('article')
      : $('main').length
        ? $('main')
        : $('body');
    const text = container
      .text()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();

    return { sourcePlatform: '網頁文章', extractedText: text };
  }

  private async get(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Fetch failed with status ${response.status} for ${url}`,
        );
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private safeHost(url: string): string | null {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  }
}
