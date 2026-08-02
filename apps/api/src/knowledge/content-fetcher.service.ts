import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class ContentFetcherService {
  private readonly logger = new Logger(ContentFetcherService.name);

  async fetchFromUrl(url: string): Promise<FetchedContent> {
    const host = this.safeHost(url);

    if (host && (host.includes('youtube.com') || host.includes('youtu.be'))) {
      return { sourcePlatform: 'YouTube', youtubeUrl: url };
    }
    if (host && host.includes('instagram.com')) {
      return this.fetchInstagramPreview(url);
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

  private async fetchInstagramPreview(url: string): Promise<FetchedContent> {
    const response = await this.get(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') ?? '';
    const description =
      $('meta[property="og:description"]').attr('content') ?? '';
    const imageUrl = $('meta[property="og:image"]').attr('content');

    const textParts = [title, description].filter(Boolean);
    let image: FetchedContent['image'];
    if (imageUrl) {
      try {
        const imageResponse = await this.get(imageUrl);
        const contentType =
          imageResponse.headers.get('content-type') ?? 'image/jpeg';
        image = {
          data: Buffer.from(await imageResponse.arrayBuffer()),
          mimeType: contentType,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to fetch IG preview image, continuing with text only: ${String(error)}`,
        );
      }
    }

    return {
      sourcePlatform: 'IG',
      extractedText: textParts.length > 0 ? textParts.join('\n') : undefined,
      image,
    };
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
