import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** 金鑰/密碼加密（2026-10-01）：Gemini 金鑰、iCloud App 專用密碼存進資料庫前先用
 * AES-256-GCM 加密，資料庫外洩也看不到原文。
 *
 * 加密金鑰：有 `DATA_ENCRYPTION_KEY` 就用它，沒有就從 `JWT_SECRET` 衍生（Render 上
 * 不用多設環境變數）。⚠️ 換掉這兩個值，已加密的資料就解不開——使用者要重新貼一次
 * 金鑰/密碼。 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  const material = process.env.DATA_ENCRYPTION_KEY ?? `life_os secret-box|${process.env.JWT_SECRET ?? 'dev-only-change-me'}`;
  return createHash('sha256').update(material).digest();
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string;
export function encryptSecret(plain: string | null): string | null;
export function encryptSecret(plain: string | null): string | null {
  if (plain == null || plain === '' || isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

/** Plaintext from before encryption existed passes through unchanged. A value that can't be
 * decrypted (encryption key changed) reads as null — same as "not set", so the user is asked again. */
export function decryptSecret(value: string): string | null;
export function decryptSecret(value: string | null | undefined): string | null;
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value;
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
