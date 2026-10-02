import { protocol, type Session } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { type BlobKind, readBlob } from './blobs';
import { parseRange } from './http-range';
import { requireSession } from './vault';

export const APP_SCHEME = 'app';

export function registerAppSchemePrivileges() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      // `stream` lets <video> issue range requests against app://video/<id>.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

function isBlobKind(value: string): value is BlobKind {
  return value === 'thumb' || value === 'preview';
}

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  // Chromium plays H.264/HEVC QuickTime files when they're labelled as MP4.
  '.mov': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/webm',
};

/**
 * Streams an original video, read-only, for playback in the viewer. Only rows marked as
 * videos are served, looked up by id (the renderer never supplies a path), and only while
 * the library is unlocked. Supports HTTP range requests so seeking works on large files.
 */
async function serveVideo(id: number, request: Request): Promise<Response> {
  let path: string;
  try {
    const { db } = requireSession();
    const row = db
      .prepare("SELECT path FROM photos WHERE id = ? AND media_type = 'video'")
      .get(id) as { path: string } | undefined;
    if (!row) return new Response(null, { status: 404 });
    path = row.path;
  } catch {
    return new Response(null, { status: 403 });
  }

  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const headers: Record<string, string> = {
    'Content-Type': VIDEO_TYPES[extname(path).toLowerCase()] ?? 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  const range = parseRange(request.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body =
    size === 0
      ? null
      : (Readable.toWeb(
          createReadStream(path, { flags: 'r', start, end })
        ) as ReadableStream);
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Serves decrypted images as app://thumb/<id> and app://preview/<id>, and original videos
 * (read-only, for playback) as app://video/<id>. Original photos are never served.
 */
export function registerAppProtocol(ses: Session) {
  ses.protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const id = Number(url.pathname.slice(1));
    if (url.hostname === 'video' && Number.isInteger(id)) return serveVideo(id, request);
    if (!isBlobKind(url.hostname) || !Number.isInteger(id)) {
      return new Response(null, { status: 400 });
    }
    try {
      const data = await readBlob(id, url.hostname);
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
