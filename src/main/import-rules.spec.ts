import { classifyExisting, isSupportedExtension, isUnchanged } from './import-rules';

describe('isUnchanged', () => {
  it('skips a known file with the same size and mtime', () => {
    expect(isUnchanged({ size: 100, mtime: 5000 }, 100, 5000.4)).toBe(true);
  });

  it.each([
    ['unknown path', undefined, 100, 5000],
    ['legacy row without file info', { size: null, mtime: null }, 100, 5000],
    ['size changed', { size: 100, mtime: 5000 }, 101, 5000],
    ['mtime changed', { size: 100, mtime: 5000 }, 100, 6000],
  ])('re-reads when %s', (_label, known, size, mtime) => {
    expect(isUnchanged(known, size, mtime)).toBe(false);
  });
});

describe('isSupportedExtension', () => {
  it.each([
    '.jpg',
    '.JPEG',
    '.png',
    '.heic',
    '.HEIF',
    '.webp',
    '.gif',
    '.tiff',
    '.cr2',
    '.nef',
    '.arw',
    '.dng',
  ])('supports %s', (ext) => {
    expect(isSupportedExtension(ext)).toBe(true);
  });

  it.each(['.mov', '.MP4', '.m4v', '.mkv'])('accepts video %s', (ext) => {
    expect(isSupportedExtension(ext)).toBe(true);
  });

  it.each(['.txt', '.pdf', ''])('ignores %s', (ext) => {
    expect(isSupportedExtension(ext)).toBe(false);
  });
});

describe('classifyExisting', () => {
  it('treats the same path as already imported', () => {
    expect(classifyExisting('/a/1.jpg', '/a/1.jpg', true)).toBe('same');
  });

  it('relinks when the recorded file is gone', () => {
    expect(classifyExisting('/a/1.jpg', '/b/renamed.jpg', false)).toBe('relink');
  });

  it('treats a copy at a second location as a duplicate', () => {
    expect(classifyExisting('/a/1.jpg', '/b/copy.jpg', true)).toBe('duplicate');
  });

  it('matches Windows paths case-insensitively', () => {
    expect(classifyExisting('D:\\Photo\\1.JPG', 'd:\\photo\\1.jpg', true, 'win32')).toBe(
      'same'
    );
  });

  it('relinks a macOS-recorded photo found on Windows', () => {
    expect(
      classifyExisting('/Volumes/Photo/1.jpg', 'D:\\Photo\\1.jpg', false, 'win32')
    ).toBe('relink');
  });

  it('keeps case-sensitive matching on macOS', () => {
    expect(classifyExisting('/a/1.JPG', '/a/1.jpg', true, 'darwin')).toBe('duplicate');
  });
});
