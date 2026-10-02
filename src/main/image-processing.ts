import exifr from 'exifr';
import heicConvert from 'heic-convert';
import sharp from 'sharp';

import { HEIC_EXTENSIONS, RAW_EXTENSIONS } from './import-rules';

export const THUMB_SIZE = 360;
export const PREVIEW_SIZE = 2048;

export interface RenderInput {
  buffer: Uint8Array;
  ext: string;
}

export interface RenderedImages {
  thumb: Uint8Array;
  preview: Uint8Array;
  width: number | null;
  height: number | null;
}

/** Converts formats libvips can't read (HEIC, RAW) into something sharp can decode. */
async function toDecodable(buffer: Buffer, ext: string): Promise<Buffer> {
  if (HEIC_EXTENSIONS.has(ext)) {
    const jpeg = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 });
    return Buffer.from(jpeg);
  }
  if (RAW_EXTENSIONS.has(ext)) {
    const embedded = await exifr.thumbnail(buffer);
    if (!embedded) throw new Error('RAW file has no embedded preview');
    return Buffer.from(embedded);
  }
  return buffer;
}

/**
 * Decodes an original photo and renders the thumbnail and preview JPEGs.
 * CPU-heavy (HEIC decoding is pure JS), so it normally runs in a worker thread.
 */
export async function renderImages({
  buffer,
  ext,
}: RenderInput): Promise<RenderedImages> {
  const input = await toDecodable(
    Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    ext
  );
  const image = sharp(input, { failOn: 'none' }).rotate();
  const [meta, thumb, preview] = await Promise.all([
    image.clone().metadata(),
    image
      .clone()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .jpeg({ quality: 78 })
      .toBuffer(),
    image
      .clone()
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer(),
  ]);
  // EXIF orientations 5-8 rotate by 90°, so the displayed size is swapped.
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    thumb,
    preview,
    width: (swap ? meta.height : meta.width) ?? null,
    height: (swap ? meta.width : meta.height) ?? null,
  };
}
