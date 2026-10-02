import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { blobName, decrypt, encrypt } from './crypto';
import { dataDir, requireSession } from './vault';

export type BlobKind = 'thumb' | 'preview';

const blobDir = () => join(dataDir(), 'blobs');

function blobPath(sha256: string, kind: BlobKind) {
  const { blobKey } = requireSession();
  return join(blobDir(), blobName(blobKey, `${kind}:${sha256}`));
}

export async function writeBlob(sha256: string, kind: BlobKind, data: Buffer) {
  const { blobKey } = requireSession();
  await mkdir(blobDir(), { recursive: true, mode: 0o700 });
  await writeFile(blobPath(sha256, kind), encrypt(blobKey, data), { mode: 0o600 });
}

export async function readBlob(photoId: number, kind: BlobKind): Promise<Buffer> {
  const { db, blobKey } = requireSession();
  const row = db.prepare('SELECT sha256 FROM photos WHERE id = ?').get(photoId) as
    { sha256: string } | undefined;
  if (!row) {
    throw new Error('Photo not found');
  }
  return decrypt(blobKey, await readFile(blobPath(row.sha256, kind)));
}
