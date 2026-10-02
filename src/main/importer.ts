import exifr from 'exifr';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { extname, join } from 'node:path';

import type { ImportProgress } from '@shared/api';
import { isWithin, pathKey, samePath } from '@shared/paths';

import { writeBlob } from './blobs';
import { audit, type Db } from './db';
import { ImagePool, POOL_DESTROYED } from './image-pool';
import {
  classifyExisting,
  isSupportedExtension,
  isUnchanged,
  isVideoExtension,
  type KnownFile,
} from './import-rules';
import { logWarn } from './logger';
import { requireSession } from './vault';
import { extractFrame, probeVideo } from './video';

const CONCURRENCY = Math.max(2, Math.min(8, availableParallelism() - 1));
const PROGRESS_INTERVAL_MS = 100;
const HASH_CHUNK = 4 * 1024 * 1024;
const ABORTED = Symbol('import aborted');

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile() && isSupportedExtension(extname(entry.name))) {
      yield fullPath;
    }
  }
}

/** SHA-256 in chunks, yielding between them so large RAW files don't stall the main process. */
async function sha256Of(buffer: Buffer): Promise<string> {
  const hash = createHash('sha256');
  for (let offset = 0; offset < buffer.length; offset += HASH_CHUNK) {
    hash.update(buffer.subarray(offset, offset + HASH_CHUNK));
    if (offset + HASH_CHUNK < buffer.length) await new Promise(setImmediate);
  }
  return hash.digest('hex');
}

/** Streams the file through SHA-256, so multi-GB videos are never loaded into memory. */
async function sha256OfFile(file: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, {
    flags: 'r',
    highWaterMark: HASH_CHUNK,
    signal,
  })) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

interface Metadata {
  takenAt: number;
  lat: number | null;
  lng: number | null;
  camera: string | null;
}

async function readMetadata(buffer: Buffer, fallbackMs: number): Promise<Metadata> {
  const exif = await exifr
    .parse(buffer, {
      gps: true,
      tiff: true,
      exif: true,
      xmp: false,
      icc: false,
      iptc: false,
    })
    .catch(() => undefined);

  const date: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
  const takenAt =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : fallbackMs;

  const lat = typeof exif?.latitude === 'number' ? exif.latitude : null;
  const lng = typeof exif?.longitude === 'number' ? exif.longitude : null;
  const camera = [exif?.Make, exif?.Model].filter(Boolean).join(' ') || null;

  return { takenAt: Math.round(takenAt), lat, lng, camera };
}

/**
 * Finds the folder entry that owns `folderPath`, so nested folders are never tracked (or
 * scanned) twice:
 * - If `folderPath` is a tracked folder, or inside one, that entry is reused.
 * - Otherwise a new entry is added, and any tracked folders inside it are merged into it.
 */
function resolveFolder(db: Db, folderPath: string): { id: number; path: string } {
  const platform = process.platform;
  const folders = db.prepare('SELECT id, path FROM folders').all() as {
    id: number;
    path: string;
  }[];
  const covering =
    folders.find((row) => samePath(row.path, folderPath, platform)) ??
    folders.find((row) => isWithin(folderPath, row.path, platform));
  const folder = covering ?? {
    id: Number(
      db
        .prepare('INSERT INTO folders (path, added_at) VALUES (?, ?)')
        .run(folderPath, Date.now()).lastInsertRowid
    ),
    path: folderPath,
  };

  // Merge any tracked subfolders (and duplicate entries) into this one.
  const nested = folders.filter(
    (row) => row.id !== folder.id && isWithin(row.path, folder.path, platform)
  );
  if (nested.length > 0) {
    const move = db.prepare('UPDATE photos SET folder_id = ? WHERE folder_id = ?');
    const remove = db.prepare('DELETE FROM folders WHERE id = ?');
    db.transaction(() => {
      for (const row of nested) {
        move.run(folder.id, row.id);
        remove.run(row.id);
      }
      audit(db, 'folder-merge', null, String(nested.length));
    })();
  }
  return folder;
}

function newProgress(folder: string): ImportProgress {
  return {
    folder,
    total: 0,
    scanned: 0,
    unchanged: 0,
    imported: 0,
    duplicates: 0,
    relinked: 0,
    failed: 0,
    done: false,
    cancelled: false,
    unavailable: false,
  };
}

export async function importFolder(
  folderPath: string,
  onProgress: (progress: ImportProgress) => void,
  signal?: AbortSignal
): Promise<ImportProgress> {
  const { db } = requireSession();
  const progress = newProgress(folderPath);

  // An unplugged drive must not mark every photo in it as missing.
  if (!existsSync(folderPath)) {
    progress.unavailable = true;
    progress.done = true;
    onProgress({ ...progress });
    return progress;
  }

  const folder = resolveFolder(db, folderPath);

  const findBySha = db.prepare('SELECT id, path FROM photos WHERE sha256 = ?');
  const relink = db.prepare(
    'UPDATE photos SET path = ?, folder_id = ?, missing = 0, file_size = ?, file_mtime = ? WHERE id = ?'
  );
  const setFileInfo = db.prepare(
    'UPDATE photos SET file_size = ?, file_mtime = ?, folder_id = ?, missing = 0 WHERE id = ?'
  );
  const insert = db.prepare(`
    INSERT INTO photos (sha256, path, folder_id, taken_at, year, month, lat, lng, camera, width, height, imported_at, file_size, file_mtime, media_type, duration)
    VALUES (@sha256, @path, @folderId, @takenAt, @year, @month, @lat, @lng, @camera, @width, @height, @importedAt, @fileSize, @fileMtime, @mediaType, @duration)
  `);

  // Everything already imported, by path, so unchanged files can be skipped cheaply.
  const known = new Map<string, KnownFile>();
  for (const row of db
    .prepare('SELECT path, file_size, file_mtime FROM photos')
    .iterate() as IterableIterator<{
    path: string;
    file_size: number | null;
    file_mtime: number | null;
  }>) {
    known.set(pathKey(row.path, process.platform), {
      size: row.file_size,
      mtime: row.file_mtime,
    });
  }

  let lastEmit = 0;
  const emit = (force = false) => {
    const now = Date.now();
    if (force || now - lastEmit >= PROGRESS_INTERVAL_MS) {
      lastEmit = now;
      onProgress({ ...progress });
    }
  };

  // Discover files first so the UI can show a determinate progress bar.
  const files: string[] = [];
  for await (const file of walk(folderPath)) {
    if (signal?.aborted) break;
    files.push(file);
    if (files.length % 200 === 0) {
      progress.total = files.length;
      emit();
    }
  }
  progress.total = files.length;
  emit(true);

  const pool = new ImagePool(CONCURRENCY);
  // Stop kills the workers at once, so in-flight HEIC/RAW decoding doesn't delay it.
  const onAbort = () => void pool.destroy();
  signal?.addEventListener('abort', onAbort, { once: true });

  // Hashes currently being processed, to avoid racing inserts of identical files.
  const inFlight = new Set<string>();

  const processFile = async (file: string) => {
    const checkAborted = () => {
      if (signal?.aborted) throw ABORTED;
    };
    try {
      const info = await stat(file);
      const mtime = Math.round(info.mtimeMs);
      if (
        isUnchanged(known.get(pathKey(file, process.platform)), info.size, info.mtimeMs)
      ) {
        progress.unchanged += 1;
        return;
      }

      checkAborted();
      const ext = extname(file).toLowerCase();
      const video = isVideoExtension(ext);
      // Originals are only ever read; nothing writes to the source folders.
      const buffer = video ? null : await readFile(file, { flag: 'r' });
      checkAborted();
      const sha256 = buffer ? await sha256Of(buffer) : await sha256OfFile(file, signal);
      checkAborted();
      const existing = findBySha.get(sha256) as { id: number; path: string } | undefined;

      if (!existing && inFlight.has(sha256)) {
        progress.duplicates += 1;
      } else if (existing) {
        const match = classifyExisting(existing.path, file, existsSync(existing.path));
        if (match === 'relink') {
          relink.run(file, folder.id, info.size, mtime, existing.id);
          audit(db, 'relink', existing.id, `${existing.path} -> ${file}`);
          progress.relinked += 1;
        } else if (match === 'duplicate') {
          progress.duplicates += 1;
        } else {
          // Same file, but size/mtime weren't recorded yet (or it was touched): remember them.
          setFileInfo.run(info.size, mtime, folder.id, existing.id);
          progress.unchanged += 1;
        }
      } else {
        inFlight.add(sha256);
        try {
          let meta: Metadata;
          let images;
          let duration: number | null = null;
          if (buffer) {
            [meta, images] = await Promise.all([
              readMetadata(buffer, info.mtimeMs),
              pool.run({ buffer, ext }),
            ]);
          } else {
            // ffmpeg/ffprobe run as separate processes, killed on Stop via the signal.
            const probe = await probeVideo(file, signal);
            checkAborted();
            const frame = await extractFrame(file, probe.duration, signal);
            checkAborted();
            if (frame.length === 0) throw new Error('No video frame');
            images = await pool.run({ buffer: frame, ext: '.jpg' });
            duration = probe.duration;
            meta = {
              takenAt: Math.round(probe.takenAt ?? info.mtimeMs),
              lat: probe.lat,
              lng: probe.lng,
              camera: probe.camera,
            };
          }
          checkAborted();
          await Promise.all([
            writeBlob(sha256, 'thumb', Buffer.from(images.thumb)),
            writeBlob(sha256, 'preview', Buffer.from(images.preview)),
          ]);
          checkAborted();
          const taken = new Date(meta.takenAt);
          insert.run({
            sha256,
            path: file,
            folderId: folder.id,
            takenAt: meta.takenAt,
            year: taken.getFullYear(),
            month: taken.getMonth() + 1,
            lat: meta.lat,
            lng: meta.lng,
            camera: meta.camera,
            width: images.width,
            height: images.height,
            importedAt: Date.now(),
            fileSize: info.size,
            fileMtime: mtime,
            mediaType: video ? 'video' : 'photo',
            duration,
          });
          progress.imported += 1;
        } finally {
          inFlight.delete(sha256);
        }
      }
    } catch (error) {
      if (error === ABORTED || error === POOL_DESTROYED || signal?.aborted) return;
      progress.failed += 1;
      logWarn(`[import] failed ${extname(file).toLowerCase() || 'file'}`, error);
    } finally {
      if (!signal?.aborted) {
        progress.scanned += 1;
        emit();
      }
    }
  };

  let next = 0;
  const worker = async () => {
    while (!signal?.aborted && next < files.length) {
      const file = files[next++];
      await processFile(file);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker)
    );
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await pool.destroy();
  }

  if (signal?.aborted) {
    progress.cancelled = true;
    audit(db, 'import-cancelled', null, JSON.stringify(progress));
    progress.done = true;
    onProgress({ ...progress });
    return progress;
  }

  const rows = (
    db.prepare('SELECT id, path FROM photos WHERE folder_id = ?').all(folder.id) as {
      id: number;
      path: string;
    }[]
  ).filter((row) => isWithin(row.path, folderPath, process.platform));
  const setMissing = db.prepare('UPDATE photos SET missing = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of rows) setMissing.run(existsSync(row.path) ? 0 : 1, row.id);
  })();

  audit(db, 'import', null, JSON.stringify(progress));
  progress.done = true;
  onProgress({ ...progress });
  return progress;
}
