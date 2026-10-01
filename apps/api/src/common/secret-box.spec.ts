import { decryptSecret, encryptSecret, isEncrypted } from './secret-box';

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
    process.env.DATA_ENCRYPTION_KEY = 'a-different-key';
    expect(decryptSecret(enc)).toBeNull();
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(decryptSecret(enc.slice(0, -4) + 'AAAA')).toBeNull();
  });
});
