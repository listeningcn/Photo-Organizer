/** Filtering the library by media type (photo/video) and file format (JPG, PNG, ...). */

import type { PhotoDto } from './api';
import { fileNameOf } from './paths';

export type MediaFilter = 'all' | 'photo' | 'video';

/** Extensions that are the same format, shown under one name. */
const FORMAT_ALIASES: Record<string, string> = {
  JPEG: 'JPG',
  TIF: 'TIFF',
  HEIF: 'HEIC',
  M2TS: 'MTS',
};

/** Upper-case format label from the file name, e.g. `IMG_1.jpeg` → `JPG`; '' if none. */
export function formatOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot + 1).toUpperCase();
  return FORMAT_ALIASES[ext] ?? ext;
}

export interface FormatCount {
  format: string;
  mediaType: PhotoDto['mediaType'];
  count: number;
}

/** Formats present in the library with how many items each has, most common first. */
export function formatCounts(
  photos: Pick<PhotoDto, 'path' | 'mediaType'>[]
): FormatCount[] {
  const counts = new Map<string, FormatCount>();
  for (const photo of photos) {
    const format = formatOf(photo.path);
    if (!format) continue;
    const entry = counts.get(format);
    if (entry) entry.count += 1;
    else counts.set(format, { format, mediaType: photo.mediaType, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.format.localeCompare(b.format)
  );
}

export interface LibraryFilter {
  media: MediaFilter;
  /** Formats to show; empty means all. */
  formats: string[];
}

export const NO_FILTER: LibraryFilter = { media: 'all', formats: [] };

export const isFiltering = (filter: LibraryFilter) =>
  filter.media !== 'all' || filter.formats.length > 0;

export function applyFilter<T extends Pick<PhotoDto, 'path' | 'mediaType'>>(
  photos: T[],
  filter: LibraryFilter
): T[] {
  if (!isFiltering(filter)) return photos;
  const formats = new Set(filter.formats);
  return photos.filter(
    (photo) =>
      (filter.media === 'all' || photo.mediaType === filter.media) &&
      (formats.size === 0 || formats.has(formatOf(photo.path)))
  );
}
