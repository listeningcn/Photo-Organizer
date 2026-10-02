import { applyFilter, formatCounts, formatOf, NO_FILTER } from './media-filter';

const item = (path: string, mediaType: 'photo' | 'video' = 'photo') => ({
  path,
  mediaType,
});

describe('formatOf', () => {
  it.each([
    ['/a/IMG_1.jpg', 'JPG'],
    ['/a/IMG_1.JPEG', 'JPG'],
    ['/a/b.tif', 'TIFF'],
    ['/a/b.heif', 'HEIC'],
    ['D:\\Photos\\clip.MOV', 'MOV'],
    ['/a/archive.tar.gz', 'GZ'],
    ['/a/noext', ''],
    ['/a/.hidden', ''],
    ['/a/trailing.', ''],
  ])('%s -> %s', (path, expected) => {
    expect(formatOf(path)).toBe(expected);
  });
});

describe('formatCounts', () => {
  it('counts formats, merging aliases, most common first', () => {
    expect(
      formatCounts([
        item('/a.jpg'),
        item('/b.jpeg'),
        item('/c.png'),
        item('/d.mov', 'video'),
        item('/e.mov', 'video'),
        item('/f.MOV', 'video'),
      ])
    ).toEqual([
      { format: 'MOV', mediaType: 'video', count: 3 },
      { format: 'JPG', mediaType: 'photo', count: 2 },
      { format: 'PNG', mediaType: 'photo', count: 1 },
    ]);
  });
});

describe('applyFilter', () => {
  const library = [
    item('/a.jpg'),
    item('/b.png'),
    item('/c.heic'),
    item('/d.mp4', 'video'),
    item('/e.mov', 'video'),
  ];

  it('returns the same list without a filter', () => {
    expect(applyFilter(library, NO_FILTER)).toBe(library);
  });

  it('filters by media type', () => {
    expect(applyFilter(library, { media: 'video', formats: [] })).toHaveLength(2);
    expect(applyFilter(library, { media: 'photo', formats: [] })).toHaveLength(3);
  });

  it('filters by format', () => {
    expect(
      applyFilter(library, { media: 'all', formats: ['JPG', 'MOV'] }).map((p) => p.path)
    ).toEqual(['/a.jpg', '/e.mov']);
  });

  it('combines media type and format', () => {
    expect(applyFilter(library, { media: 'photo', formats: ['JPG', 'MOV'] })).toEqual([
      item('/a.jpg'),
    ]);
  });
});
