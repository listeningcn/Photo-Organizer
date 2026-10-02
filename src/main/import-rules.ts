import { type Platform, samePath } from '@shared/paths';

export const HEIC_EXTENSIONS = new Set(['.heic', '.heif']);
export const RAW_EXTENSIONS = new Set([
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.dng',
  '.orf',
  '.rw2',
  '.raf',
]);
export const STANDARD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.tif',
  '.tiff',
]);

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.3gp',
  '.mts',
  '.m2ts',
]);

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase());
}

export function isSupportedExtension(ext: string): boolean {
  const lower = ext.toLowerCase();
  return (
    STANDARD_EXTENSIONS.has(lower) ||
    HEIC_EXTENSIONS.has(lower) ||
    RAW_EXTENSIONS.has(lower) ||
    VIDEO_EXTENSIONS.has(lower)
  );
}

export type ExistingMatch = 'same' | 'relink' | 'duplicate';

export interface KnownFile {
  size: number | null;
  mtime: number | null;
}

/**
 * True when a file at an already-imported path still has the recorded size and
 * modified time, so it can be skipped without reading or hashing it.
 */
export function isUnchanged(
  known: KnownFile | undefined,
  size: number,
  mtimeMs: number
): boolean {
  return (
    known !== undefined && known.size === size && known.mtime === Math.round(mtimeMs)
  );
}

/**
 * Decides what to do when a scanned file's hash is already in the library.
 * If the recorded path no longer exists, the file was moved or renamed, so the record follows it.
 */
export function classifyExisting(
  recordedPath: string,
  scannedPath: string,
  recordedPathExists: boolean,
  platform: Platform = process.platform
): ExistingMatch {
  if (samePath(recordedPath, scannedPath, platform)) return 'same';
  return recordedPathExists ? 'duplicate' : 'relink';
}
