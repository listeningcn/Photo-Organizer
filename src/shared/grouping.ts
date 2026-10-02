export type GroupBy = 'year' | 'month';

export interface PhotoGroup<T> {
  key: string;
  label: string;
  photos: T[];
}

const UNKNOWN_KEY = 'unknown';
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

function groupKey(takenAt: number, by: GroupBy): { key: string; label: string } {
  const date = new Date(takenAt);
  const year = date.getFullYear();
  if (by === 'year') {
    return { key: String(year), label: String(year) };
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { key: `${year}-${month}`, label: monthFormatter.format(date) };
}

/** Groups newest-first; photos without a date go in a final "Unknown date" group. */
export function groupPhotos<T extends { takenAt: number | null }>(
  photos: T[],
  by: GroupBy
): PhotoGroup<T>[] {
  const sorted = [...photos].sort(
    (a, b) => (b.takenAt ?? -Infinity) - (a.takenAt ?? -Infinity)
  );
  const groups = new Map<string, PhotoGroup<T>>();

  for (const photo of sorted) {
    const { key, label } =
      photo.takenAt === null
        ? { key: UNKNOWN_KEY, label: 'Unknown date' }
        : groupKey(photo.takenAt, by);
    const group = groups.get(key) ?? { key, label, photos: [] };
    group.photos.push(photo);
    groups.set(key, group);
  }

  return [...groups.values()];
}
