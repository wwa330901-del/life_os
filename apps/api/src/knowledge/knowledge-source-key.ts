import { createHash } from 'crypto';

// 重複偵測用的「來源鑰匙」（2026-11-27）。同一個東西不管怎麼分享過來，
// 鑰匙都要一樣：IG 貼文、YouTube 影片抓 id；一般網址拿掉追蹤參數、#、結尾斜線。
// 圖片/影片/文字用內容的 sha256。純函式，好測。

const TRACKING_PARAMS = /^(utm_.*|igsh|igshid|si|fbclid|gclid|ref|ref_src|feature|share_id|mibextid|s|t)$/i;

export function sourceKeyForUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const path = url.pathname.replace(/\/+$/, '');

  if (host === 'instagram.com') {
    const m = path.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([^/]+)/);
    if (m) return `ig:${m[2]}`;
  }
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (id) return `yt:${id}`;
  }
  if (host === 'youtube.com') {
    const v = url.searchParams.get('v');
    if (v) return `yt:${v}`;
    const m = path.match(/^\/(shorts|live|embed)\/([^/]+)/);
    if (m) return `yt:${m[2]}`;
  }

  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `url:${host}${path}${query}`;
}

export function sourceKeyForBytes(data: Buffer): string {
  return `sha:${createHash('sha256').update(data).digest('hex')}`;
}

export function sourceKeyForText(text: string): string {
  return sourceKeyForBytes(Buffer.from(text.replace(/\s+/g, ' ').trim(), 'utf8'));
}
