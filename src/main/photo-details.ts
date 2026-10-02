import exifr from 'exifr';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import type { PhotoDetails } from '@shared/photo-details';

const str = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
};
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Reads EXIF details straight from the original file (read-only) when the viewer asks.
 * Results are only sent to the renderer; nothing is written to disk.
 */
export async function readPhotoDetails(path: string): Promise<PhotoDetails> {
  const details: PhotoDetails = {
    fileName: basename(path),
    fileSize: null,
    fileModified: null,
    format: extname(path).slice(1).toUpperCase() || null,
    make: null,
    model: null,
    lens: null,
    software: null,
    exposureTime: null,
    fNumber: null,
    iso: null,
    focalLength: null,
    focalLength35: null,
    exposureBias: null,
    exposureProgram: null,
    meteringMode: null,
    flash: null,
    whiteBalance: null,
    colorSpace: null,
    orientation: null,
    altitude: null,
    direction: null,
    timeZone: null,
    artist: null,
    copyright: null,
    description: null,
  };

  try {
    const info = await stat(path);
    details.fileSize = info.size;
    details.fileModified = Math.round(info.mtimeMs);
  } catch {
    return details; // File is missing or the drive is disconnected.
  }

  const exif = await exifr
    .parse(path, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: false,
      icc: false,
      iptc: false,
      translateValues: true,
      reviveValues: true,
    })
    .catch(() => undefined);
  if (!exif) return details;

  details.make = str(exif.Make);
  details.model = str(exif.Model);
  details.lens = str(exif.LensModel) ?? str(exif.LensMake);
  details.software = str(exif.Software);
  details.exposureTime = num(exif.ExposureTime);
  details.fNumber = num(exif.FNumber);
  details.iso = num(exif.ISO) ?? num(exif.ISOSpeedRatings);
  details.focalLength = num(exif.FocalLength);
  details.focalLength35 = num(exif.FocalLengthIn35mmFormat);
  details.exposureBias = num(exif.ExposureCompensation);
  details.exposureProgram = str(exif.ExposureProgram);
  details.meteringMode = str(exif.MeteringMode);
  details.flash = str(exif.Flash);
  details.whiteBalance = str(exif.WhiteBalance);
  details.colorSpace = str(exif.ColorSpace);
  details.orientation = str(exif.Orientation);
  details.altitude = num(exif.GPSAltitude);
  details.direction = num(exif.GPSImgDirection);
  details.timeZone = str(exif.OffsetTimeOriginal) ?? str(exif.OffsetTime);
  details.artist = str(exif.Artist);
  details.copyright = str(exif.Copyright);
  details.description = str(exif.ImageDescription);
  return details;
}
