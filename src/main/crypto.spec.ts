import { randomBytes } from 'node:crypto';

import { blobName, decrypt, encrypt } from './crypto';

describe('crypto', () => {
  const key = randomBytes(32);

  it('round-trips data', () => {
    const data = Buffer.from('hello photos');
    expect(decrypt(key, encrypt(key, data)).toString()).toBe('hello photos');
  });

  it('uses a fresh IV each time', () => {
    const data = Buffer.from('same');
    expect(encrypt(key, data).equals(encrypt(key, data))).toBe(false);
  });

  it('rejects tampered data and wrong keys', () => {
    const payload = encrypt(key, Buffer.from('secret'));
    const tampered = Buffer.from(payload);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decrypt(key, tampered)).toThrow();
    expect(() => decrypt(randomBytes(32), payload)).toThrow();
  });

  it('derives stable, key-dependent blob names', () => {
    expect(blobName(key, 'abc')).toBe(blobName(key, 'abc'));
    expect(blobName(key, 'abc')).not.toBe(blobName(randomBytes(32), 'abc'));
  });
});
