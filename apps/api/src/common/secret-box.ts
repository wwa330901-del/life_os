import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** 金鑰/密碼加密（2026-10-01）：Claude/Gemini 金鑰、iCloud App 專用密碼、Google 權杖
 * 存進資料庫前先用 AES-256-GCM 加密，資料庫外洩也看不到原文。
 *
 * 兩種版本（2026-11-17）：
 * - `enc:v1:` 金鑰從 `JWT_SECRET` 衍生（舊資料都是這種）。
 * - `enc:v2:` 金鑰是獨立的 `DATA_ENCRYPTION_KEY`。
 * 有設 `DATA_ENCRYPTION_KEY` 就用 v2 加密，v1 仍讀得到；啟動時 SecretMigrationService
 * 會把 v1 重新加密成 v2，之後就跟 JWT_SECRET 脫鉤。
 * ⚠️ 換掉 DATA_ENCRYPTION_KEY（或在還沒設它時換 JWT_SECRET），已加密的資料就解不開——
 * 使用者要重新貼一次金鑰/密碼。 */
const V1 = 'enc:v1:';
const V2 = 'enc:v2:';

function v1Key(): Buffer {
  return createHash('sha256').update(`life_os secret-box|${process.env.JWT_SECRET ?? 'dev-only-change-me'}`).digest();
}

function v2Key(): Buffer | null {
  const material = process.env.DATA_ENCRYPTION_KEY;
  return material ? createHash('sha256').update(`life_os secret-box v2|${material}`).digest() : null;
}

/** 現在新加密的資料會用的前綴。 */
export function currentSecretPrefix(): string {
  return v2Key() ? V2 : V1;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(V1) || value.startsWith(V2);
}

function encryptWith(plain: string): string {
  const prefix = currentSecretPrefix();
  const key = prefix === V2 ? v2Key()! : v1Key();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${prefix}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function encryptSecret(plain: string): string;
export function encryptSecret(plain: string | null): string | null;
export function encryptSecret(plain: string | null): string | null {
  if (plain == null || plain === '' || isEncrypted(plain)) return plain;
  return encryptWith(plain);
}

/** Plaintext from before encryption existed passes through unchanged. A value that can't be
 * decrypted (encryption key changed) reads as null — same as "not set", so the user is asked again. */
export function decryptSecret(value: string): string | null;
export function decryptSecret(value: string | null | undefined): string | null;
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value;
  const key = value.startsWith(V2) ? v2Key() : v1Key();
  if (!key) return null;
  try {
    const [iv, tag, data] = value.slice(V1.length).split(':').map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** 明文或舊版本 → 用現在的金鑰重新加密。解不開的原樣留著（之後換回金鑰還讀得到，
 * 不要因為一次設定錯誤就把資料毀掉）。 */
export function reencryptSecret(value: string): string;
export function reencryptSecret(value: string | null): string | null;
export function reencryptSecret(value: string | null): string | null {
  if (value == null || value === '' || value.startsWith(currentSecretPrefix())) return value;
  const plain = decryptSecret(value);
  if (plain == null) return value;
  return encryptWith(plain);
}
