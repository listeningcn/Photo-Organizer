import { groupPhotos } from './grouping';

const at = (year: number, month: number, day = 1) =>
  new Date(year, month - 1, day, 12).getTime();

describe('groupPhotos', () => {
  const photos = [
    { id: 1, takenAt: at(2023, 5, 3) },
    { id: 2, takenAt: null },
    { id: 3, takenAt: at(2024, 1, 10) },
    { id: 4, takenAt: at(2023, 5, 20) },
    { id: 5, takenAt: at(2023, 12, 25) },
  ];

  it('groups by year, newest first, unknown dates last', () => {
    const groups = groupPhotos(photos, 'year');
    expect(groups.map((g) => g.key)).toEqual(['2024', '2023', 'unknown']);
    expect(groups[1].photos.map((p) => p.id)).toEqual([5, 4, 1]);
    expect(groups[2].label).toBe('Unknown date');
  });

  it('groups by month', () => {
    const groups = groupPhotos(photos, 'month');
    expect(groups.map((g) => g.key)).toEqual([
      '2024-01',
      '2023-12',
      '2023-05',
      'unknown',
    ]);
    expect(groups[2].photos.map((p) => p.id)).toEqual([4, 1]);
  });

  it('returns no groups for no photos', () => {
    expect(groupPhotos([], 'month')).toEqual([]);
  });
});
