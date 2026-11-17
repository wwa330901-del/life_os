import { currentSecretPrefix, decryptSecret, encryptSecret, isEncrypted, reencryptSecret } from './secret-box';

describe('secret-box', () => {
  const OLD = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = OLD;
    delete process.env.DATA_ENCRYPTION_KEY;
  });

  it('round-trips and never stores the plain value', () => {
    const enc = encryptSecret('AIzaSy-secret-key');
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('AIzaSy');
    expect(encryptSecret('AIzaSy-secret-key')).not.toBe(enc); // random IV
    expect(decryptSecret(enc)).toBe('AIzaSy-secret-key');
  });

  it('passes through legacy plain text, null and already-encrypted values', () => {
    expect(decryptSecret('plain-old-key')).toBe('plain-old-key');
    expect(decryptSecret(null)).toBeNull();
    expect(encryptSecret(null)).toBeNull();
    const enc = encryptSecret('x');
    expect(encryptSecret(enc)).toBe(enc);
  });

  it('reads as not set when the encryption key changed or the value was tampered with', () => {
    const enc = encryptSecret('abc');
    process.env.JWT_SECRET = 'a-different-jwt';
    expect(decryptSecret(enc)).toBeNull();
    process.env.JWT_SECRET = OLD;
    expect(decryptSecret(enc.slice(0, -4) + 'AAAA')).toBeNull();
  });

  it('uses v2 once DATA_ENCRYPTION_KEY is set and still reads v1', () => {
    const v1 = encryptSecret('old-key');
    expect(v1.startsWith('enc:v1:')).toBe(true);
    process.env.DATA_ENCRYPTION_KEY = 'independent-key';
    expect(currentSecretPrefix()).toBe('enc:v2:');
    expect(decryptSecret(v1)).toBe('old-key');
    const v2 = encryptSecret('new-key');
    expect(v2.startsWith('enc:v2:')).toBe(true);
    expect(decryptSecret(v2)).toBe('new-key');
    // v2 不再跟 JWT_SECRET 有關
    process.env.JWT_SECRET = 'rotated-jwt';
    expect(decryptSecret(v2)).toBe('new-key');
  });

  it('re-encrypts plain/v1 to the current version and leaves unreadable values alone', () => {
    const v1 = encryptSecret('old-key');
    process.env.DATA_ENCRYPTION_KEY = 'independent-key';
    const moved = reencryptSecret(v1);
    expect(moved.startsWith('enc:v2:')).toBe(true);
    expect(decryptSecret(moved)).toBe('old-key');
    expect(reencryptSecret(moved)).toBe(moved);
    expect(decryptSecret(reencryptSecret('plain'))).toBe('plain');
    expect(reencryptSecret(null)).toBeNull();

    process.env.JWT_SECRET = 'other-jwt';
    const broken = encryptSecret('x').replace('enc:v2:', 'enc:v1:');
    expect(reencryptSecret(broken)).toBe(broken);
  });
});
