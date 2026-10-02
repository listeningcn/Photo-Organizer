import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** AES-256-GCM. Output layout: iv (12) | auth tag (16) | ciphertext. */
export function encrypt(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decrypt(key: Buffer, payload: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(payload.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]);
}

/** Keyed name so blob filenames don't reveal photo hashes. */
export function blobName(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}
