/** Pure parsing of `ffprobe -print_format json` output, kept separate so it can be unit tested. */

export interface VideoMeta {
  /** Seconds, or null when unknown. */
  duration: number | null;
  /** Capture time in ms since epoch, or null when the file doesn't record one. */
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
}

interface ProbeTags {
  [key: string]: string | undefined;
}

export interface ProbeOutput {
  format?: { duration?: string; tags?: ProbeTags };
  streams?: { codec_type?: string; duration?: string; tags?: ProbeTags }[];
}

/** Parses ISO 6709 locations as written by phones and cameras, e.g. `+37.7749-122.4194+010.000/`. */
export function parseIso6709(
  value: string | undefined
): { lat: number; lng: number } | null {
  if (!value) return null;
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Tag keys are case-insensitive in practice (`creation_time`, `com.apple.quicktime.make`, ...). */
function tag(tags: ProbeTags | undefined, ...names: string[]): string | undefined {
  if (!tags) return undefined;
  for (const name of names) {
    for (const [key, value] of Object.entries(tags)) {
      if (key.toLowerCase() === name && value?.trim()) return value.trim();
    }
  }
  return undefined;
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  // Many cameras write 1904-01-01 or 1970-01-01 when the clock isn't set.
  if (!Number.isFinite(ms) || ms <= Date.UTC(1971, 0, 1)) return null;
  return ms;
}

export function parseProbe(probe: ProbeOutput): VideoMeta {
  const formatTags = probe.format?.tags;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');

  const durationText = probe.format?.duration ?? video?.duration;
  const duration = durationText !== undefined ? Number(durationText) : NaN;

  const takenAt =
    parseDate(tag(formatTags, 'com.apple.quicktime.creationdate')) ??
    parseDate(tag(formatTags, 'creation_time')) ??
    parseDate(tag(video?.tags, 'creation_time'));

  const location = parseIso6709(
    tag(formatTags, 'com.apple.quicktime.location.iso6709', 'location', 'location-eng')
  );

  const make = tag(formatTags, 'com.apple.quicktime.make', 'make');
  const model = tag(formatTags, 'com.apple.quicktime.model', 'model');
  const camera = [make, model].filter(Boolean).join(' ') || null;

  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    takenAt,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    camera,
  };
}
