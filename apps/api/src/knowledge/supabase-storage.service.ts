import { Injectable, Logger } from '@nestjs/common';

const BUCKET = 'knowledge-media';
const SIGNED_URL_TTL_SECONDS = 3600;

/** Thin REST client for Supabase Storage (2026-08-06) — plain `fetch` calls
 * against the Storage HTTP API rather than the `@supabase/supabase-js` SDK,
 * matching this codebase's existing "no SDK for a service only used for one
 * narrow thing" convention (see e.g. `LineNotifierService`'s raw
 * `fetch`-based LINE push). `knowledge-media` is a PRIVATE bucket (contains
 * personal photos/videos users send to 知識庫) — every read goes through a
 * time-limited signed URL, nothing is ever publicly reachable by a guessed
 * path. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are plain env vars, same
 * secret-handling convention as `LINE_CHANNEL_ACCESS_TOKEN`. */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly baseUrl = process.env.SUPABASE_URL ?? '';
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  get configured(): boolean {
    return Boolean(this.baseUrl && this.serviceKey);
  }

  private get headers() {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey };
  }

  async upload(path: string, data: Buffer, contentType: string): Promise<void> {
    if (!this.configured) throw new Error('Supabase Storage 尚未設定（缺少環境變數）');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Supabase Storage 上傳失敗 path=${path} status=${res.status} ${body}`);
      throw new Error('原始檔上傳失敗');
    }
  }

  async download(path: string): Promise<{ data: Buffer; contentType: string }> {
    if (!this.configured) throw new Error('Supabase Storage 尚未設定（缺少環境變數）');
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error('原始檔下載失敗（可能已經被刪除）');
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { data: Buffer.from(await res.arrayBuffer()), contentType };
  }

  /** A private bucket has no permanent public URL — every display has to
   * mint a fresh short-lived signed one (1 hour), never cached/stored. */
  async getSignedUrl(path: string): Promise<string | null> {
    if (!this.configured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/storage/v1/object/sign/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { signedURL?: string };
      return body.signedURL ? `${this.baseUrl}/storage/v1${body.signedURL}` : null;
    } catch (error) {
      this.logger.warn(`簽名網址產生失敗 path=${path}: ${error}`);
      return null;
    }
  }
}
