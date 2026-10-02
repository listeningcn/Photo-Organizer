/** Extra details read on demand from the original file. Never persisted. */
export interface PhotoDetails {
  fileName: string;
  fileSize: number | null;
  fileModified: number | null;
  format: string | null;
  make: string | null;
  model: string | null;
  lens: string | null;
  software: string | null;
  exposureTime: number | null;
  fNumber: number | null;
  iso: number | null;
  focalLength: number | null;
  focalLength35: number | null;
  exposureBias: number | null;
  exposureProgram: string | null;
  meteringMode: string | null;
  flash: string | null;
  whiteBalance: string | null;
  colorSpace: string | null;
  orientation: string | null;
  altitude: number | null;
  direction: number | null;
  timeZone: string | null;
  artist: string | null;
  copyright: string | null;
  description: string | null;
}

/** Video length as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** 0.004 → "1/250 s", 2.5 → "2.5 s". */
export function formatExposureTime(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds >= 1) return `${Number(seconds.toFixed(1))} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

export function formatAperture(fNumber: number): string {
  return `ƒ/${Number(fNumber.toFixed(1))}`;
}

export function formatExposureBias(ev: number): string {
  if (ev === 0) return '0 EV';
  const rounded = Number(ev.toFixed(2));
  return `${rounded > 0 ? '+' : ''}${rounded} EV`;
}

export function formatMegapixels(width: number, height: number): string {
  return `${((width * height) / 1_000_000).toFixed(1)} MP`;
}

/** One-line summary like "ƒ/1.8 · 1/120 s · ISO 100 · 26 mm". */
export function exposureSummary(details: PhotoDetails): string | null {
  const parts = [
    details.fNumber ? formatAperture(details.fNumber) : null,
    details.exposureTime ? formatExposureTime(details.exposureTime) : null,
    details.iso ? `ISO ${details.iso}` : null,
    details.focalLength ? `${Number(details.focalLength.toFixed(1))} mm` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
