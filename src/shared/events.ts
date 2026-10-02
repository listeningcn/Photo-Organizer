/**
 * Groups photos into events (a birthday, a day at the beach) and trips (time away from
 * home). Pure and deterministic so it can run in the renderer and be unit tested.
 */

export interface EventInput {
  id: number;
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type EventKind = 'trip' | 'event';

export interface PhotoEvent {
  /** Stable key (the first photo's id), used to store a custom title. */
  key: string;
  kind: EventKind;
  start: number;
  end: number;
  /** Photo ids in time order. */
  photoIds: number[];
  /** Median location of the photos that have GPS, or null if none do. */
  centre: LatLng | null;
  /** Distance of the centre from home in km, or null without home or GPS. */
  distanceKm: number | null;
}

export interface EventOptions {
  /** A gap longer than this starts a new event. */
  gapHours: number;
  home: LatLng | null;
  /** Events whose centre is farther than this from home are trips. */
  tripKm: number;
  /** While away from home, gaps up to this long (e.g. a night) don't split the trip. */
  tripGapHours: number;
  /** Non-trip events with fewer photos than this are dropped as noise. */
  minPhotos: number;
}

export const DEFAULT_EVENT_OPTIONS: EventOptions = {
  gapHours: 8,
  home: null,
  tripKm: 50,
  tripGapHours: 36,
  minPhotos: 5,
};

const HOUR = 3_600_000;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

type Dated = EventInput & { takenAt: number };
const hasGps = (p: EventInput): p is EventInput & LatLng =>
  p.lat !== null && p.lng !== null;

function centreOf(photos: EventInput[]): LatLng | null {
  const geo = photos.filter(hasGps);
  if (geo.length === 0) return null;
  return { lat: median(geo.map((p) => p.lat)), lng: median(geo.map((p) => p.lng)) };
}

function isAway(photos: EventInput[], home: LatLng | null, tripKm: number): boolean {
  if (!home) return false;
  const centre = centreOf(photos);
  return centre !== null && haversineKm(home, centre) > tripKm;
}

export function clusterEvents(
  photos: EventInput[],
  options: Partial<EventOptions> = {}
): PhotoEvent[] {
  const opts = { ...DEFAULT_EVENT_OPTIONS, ...options };
  const dated = photos
    .filter((p): p is Dated => p.takenAt !== null)
    .sort((a, b) => a.takenAt - b.takenAt || a.id - b.id);

  // 1. Split on time gaps.
  const runs: Dated[][] = [];
  for (const photo of dated) {
    const run = runs.at(-1);
    if (run && photo.takenAt - run[run.length - 1].takenAt <= opts.gapHours * HOUR) {
      run.push(photo);
    } else {
      runs.push([photo]);
    }
  }

  // 2. While a trip is going on, join the next run if it's close in time and also away,
  //    so a multi-day trip isn't cut up by nights.
  const merged: Dated[][] = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    const gap = prev ? run[0].takenAt - prev[prev.length - 1].takenAt : Infinity;
    if (
      prev &&
      gap <= opts.tripGapHours * HOUR &&
      isAway(prev, opts.home, opts.tripKm) &&
      isAway(run, opts.home, opts.tripKm)
    ) {
      prev.push(...run);
    } else {
      merged.push([...run]);
    }
  }

  // 3. Trips contain only geotagged photos. Photos without GPS from a trip's time span
  //    are regrouped by time gaps into ordinary events.
  const groups: Dated[][] = [];
  const leftovers: Dated[] = [];
  for (const group of merged) {
    if (isAway(group, opts.home, opts.tripKm)) {
      groups.push(group.filter(hasGps));
      leftovers.push(...group.filter((p) => !hasGps(p)));
    } else {
      groups.push(group);
    }
  }
  let current: Dated[] | null = null;
  for (const photo of leftovers) {
    const previous = current?.at(-1);
    if (current && previous && photo.takenAt - previous.takenAt <= opts.gapHours * HOUR) {
      current.push(photo);
    } else {
      current = [photo];
      groups.push(current);
    }
  }
  groups.sort((a, b) => a[0].takenAt - b[0].takenAt || a[0].id - b[0].id);

  return groups
    .map((group): PhotoEvent => {
      const centre = centreOf(group);
      const distanceKm = centre && opts.home ? haversineKm(opts.home, centre) : null;
      return {
        key: String(group[0].id),
        kind: distanceKm !== null && distanceKm > opts.tripKm ? 'trip' : 'event',
        start: group[0].takenAt,
        end: group[group.length - 1].takenAt,
        photoIds: group.map((p) => p.id),
        centre,
        distanceKm,
      };
    })
    .filter((event) => event.kind === 'trip' || event.photoIds.length >= opts.minPhotos)
    .reverse(); // Newest first, like the timeline.
}

/** Local calendar day, `YYYY-MM-DD`. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface EventDay {
  day: string;
  /** 1-based index within the event. */
  index: number;
  photoIds: number[];
}

/** Splits an event into local calendar days, keeping time order. */
export function daysOf<T extends EventInput>(photos: T[]): EventDay[] {
  const days: EventDay[] = [];
  for (const photo of photos) {
    if (photo.takenAt === null) continue;
    const day = dayKey(photo.takenAt);
    const last = days.at(-1);
    if (last?.day === day) last.photoIds.push(photo.id);
    else days.push({ day, index: days.length + 1, photoIds: [photo.id] });
  }
  return days;
}

/** Time-ordered GPS points for drawing a route, thinned to at most `max` points. */
export function routeOf(photos: EventInput[], max = 200): (LatLng & { id: number })[] {
  const points = photos
    .filter(hasGps)
    .filter((p) => p.takenAt !== null)
    .sort((a, b) => a.takenAt! - b.takenAt!)
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Centre of the ~5 km grid cell with the most photos; a good guess for "home". */
export function mostCommonLocation(photos: EventInput[]): LatLng | null {
  const cells = new Map<string, LatLng[]>();
  for (const photo of photos) {
    if (!hasGps(photo)) continue;
    const key = `${Math.round(photo.lat * 20)},${Math.round(photo.lng * 20)}`;
    const cell = cells.get(key);
    if (cell) cell.push(photo);
    else cells.set(key, [photo]);
  }
  let best: LatLng[] | null = null;
  for (const cell of cells.values()) if (!best || cell.length > best.length) best = cell;
  return best ? centreOf(best.map((p, i) => ({ id: i, takenAt: null, ...p }))) : null;
}

/** Parses the stored home preference (`"lat,lng"`). */
export function parseLatLng(value: string | null | undefined): LatLng | null {
  if (!value) return null;
  const [lat, lng] = value.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const formatLatLng = ({ lat, lng }: LatLng) =>
  `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** "Apr 3 – 9, 2025", "Apr 30 – May 2, 2025" or "Mon, Apr 3, 2025" for one day. */
export function formatDateRange(start: number, end: number, locale?: string): string {
  if (dayKey(start) === dayKey(end)) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(start);
  }
  const format = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return format.formatRange(start, end);
}
