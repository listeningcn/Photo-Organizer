import {
  clusterEvents,
  daysOf,
  type EventInput,
  formatDateRange,
  haversineKm,
  mostCommonLocation,
  parseLatLng,
  routeOf,
} from './events';

const HOUR = 3_600_000;
const T0 = new Date(2025, 3, 3, 9, 0).getTime(); // Apr 3 2025, 09:00 local
const HOME = { lat: 37.77, lng: -122.42 }; // San Francisco
const KYOTO = { lat: 35.01, lng: 135.77 };

let nextId = 1;
const photo = (hoursFromStart: number, at: { lat: number; lng: number } | null = null) =>
  ({
    id: nextId++,
    takenAt: T0 + hoursFromStart * HOUR,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  }) satisfies EventInput;
const burst = (
  startHour: number,
  count: number,
  at: { lat: number; lng: number } | null = null
) => Array.from({ length: count }, (_, i) => photo(startHour + i * 0.1, at));

describe('haversineKm', () => {
  it('measures San Francisco to Kyoto', () => {
    expect(haversineKm(HOME, KYOTO)).toBeGreaterThan(8500);
    expect(haversineKm(HOME, KYOTO)).toBeLessThan(8900);
    expect(haversineKm(HOME, HOME)).toBe(0);
  });
});

describe('clusterEvents', () => {
  it('splits on time gaps and returns newest first', () => {
    const events = clusterEvents([...burst(0, 6), ...burst(48, 6)]);
    expect(events).toHaveLength(2);
    expect(events[0].start).toBeGreaterThan(events[1].start);
    expect(events.every((e) => e.kind === 'event')).toBe(true);
  });

  it('drops tiny non-trip clusters', () => {
    expect(clusterEvents(burst(0, 3))).toEqual([]);
  });

  it('keeps a multi-day trip together across nights', () => {
    const photos = [
      ...burst(0, 5, KYOTO),
      ...burst(24, 5, KYOTO),
      ...burst(48, 5, KYOTO),
    ];
    const events = clusterEvents(photos, { home: HOME });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('trip');
    expect(events[0].photoIds).toHaveLength(15);
    expect(events[0].distanceKm).toBeGreaterThan(8000);
  });

  it('keeps GPS-less photos out of trips and groups them as events', () => {
    const photos = [...burst(0, 5, KYOTO), ...burst(1, 5), ...burst(30, 5, KYOTO)];
    const events = clusterEvents(photos, { home: HOME });
    const trip = events.find((e) => e.kind === 'trip')!;
    expect(trip.photoIds).toHaveLength(10);
    const event = events.find((e) => e.kind === 'event')!;
    expect(event.photoIds).toHaveLength(5);
    expect(event.centre).toBeNull();
  });

  it('does not merge days at home', () => {
    const events = clusterEvents([...burst(0, 5, HOME), ...burst(24, 5, HOME)], {
      home: HOME,
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'event')).toBe(true);
  });

  it('keeps even small trips', () => {
    const events = clusterEvents(burst(0, 2, KYOTO), { home: HOME });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('trip');
  });

  it('ignores undated photos and works without home', () => {
    const photos = [
      ...burst(0, 5, KYOTO),
      { id: 999, takenAt: null, lat: null, lng: null },
    ];
    const events = clusterEvents(photos);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('event');
    expect(events[0].photoIds).not.toContain(999);
  });
});

describe('daysOf', () => {
  it('numbers local calendar days', () => {
    const photos = [photo(0), photo(2), photo(24), photo(50)];
    const days = daysOf(photos);
    expect(days.map((d) => d.index)).toEqual([1, 2, 3]);
    expect(days[0].photoIds).toHaveLength(2);
  });
});

describe('routeOf', () => {
  it('orders GPS points by time and thins them', () => {
    const photos = Array.from({ length: 500 }, (_, i) => photo(500 - i, KYOTO));
    const route = routeOf(photos, 50);
    expect(route).toHaveLength(50);
    const times = route.map((p) => photos.find((x) => x.id === p.id)!.takenAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('mostCommonLocation', () => {
  it('picks the densest area', () => {
    const home = mostCommonLocation([...burst(0, 10, HOME), ...burst(0, 3, KYOTO)]);
    expect(home && haversineKm(home, HOME)).toBeLessThan(1);
    expect(mostCommonLocation(burst(0, 3))).toBeNull();
  });
});

describe('parseLatLng', () => {
  it('parses valid values only', () => {
    expect(parseLatLng('37.5,-122.25')).toEqual({ lat: 37.5, lng: -122.25 });
    expect(parseLatLng('100,0')).toBeNull();
    expect(parseLatLng('abc')).toBeNull();
    expect(parseLatLng(null)).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('shows one date for a single day and a range otherwise', () => {
    expect(formatDateRange(T0, T0 + HOUR, 'en-US')).toBe('Apr 3, 2025');
    expect(formatDateRange(T0, T0 + 6 * 24 * HOUR, 'en-US')).toMatch(
      /Apr 3\s*–\s*9, 2025/
    );
  });
});
