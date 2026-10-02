import {
  fileNameOf,
  isWithin,
  modKey,
  pathKey,
  samePath,
  topLevelFolders,
} from './paths';

describe('isWithin', () => {
  it('matches the folder itself and anything below it', () => {
    expect(isWithin('/Photos', '/Photos', 'darwin')).toBe(true);
    expect(isWithin('/Photos/', '/Photos', 'darwin')).toBe(true);
    expect(isWithin('/Photos/2024/a.jpg', '/Photos', 'darwin')).toBe(true);
    expect(isWithin('/Photos/2024', '/Photos/', 'darwin')).toBe(true);
  });

  it('compares whole path segments', () => {
    expect(isWithin('/Photos2/a.jpg', '/Photos', 'darwin')).toBe(false);
    expect(isWithin('/Photos', '/Photos/2024', 'darwin')).toBe(false);
  });

  it('handles roots', () => {
    expect(isWithin('/Volumes/X', '/', 'darwin')).toBe(true);
    expect(isWithin('D:\\Photo', 'D:\\', 'win32')).toBe(true);
    expect(isWithin('E:\\Photo', 'D:\\', 'win32')).toBe(false);
  });

  it('is case-insensitive on Windows only', () => {
    expect(isWithin('d:/photo/2024', 'D:\\Photo', 'win32')).toBe(true);
    expect(isWithin('/photos/2024', '/Photos', 'darwin')).toBe(false);
  });
});

describe('topLevelFolders', () => {
  it('drops subfolders and duplicates, keeping order', () => {
    expect(
      topLevelFolders(['/A/sub', '/B', '/A', '/A/sub/deeper', '/B', '/AB'], 'darwin')
    ).toEqual(['/B', '/A', '/AB']);
  });

  it('collapses Windows paths case-insensitively', () => {
    expect(topLevelFolders(['D:\\Photo\\2024', 'd:\\photo'], 'win32')).toEqual([
      'd:\\photo',
    ]);
  });
});

describe('pathKey / samePath', () => {
  it('compares macOS and Linux paths exactly', () => {
    expect(samePath('/Volumes/Photo/a.jpg', '/Volumes/Photo/a.jpg', 'darwin')).toBe(true);
    expect(samePath('/Volumes/Photo/a.jpg', '/volumes/photo/A.jpg', 'darwin')).toBe(
      false
    );
    expect(samePath('/home/u/a.jpg', '/home/u/A.jpg', 'linux')).toBe(false);
  });

  it('ignores case and separator style on Windows', () => {
    expect(samePath('D:\\Photo\\2013\\a.JPG', 'd:/photo/2013/a.jpg', 'win32')).toBe(true);
    expect(samePath('D:\\Photo\\', 'd:\\photo', 'win32')).toBe(true);
    expect(samePath('D:\\Photo\\a.jpg', 'D:\\Photo\\b.jpg', 'win32')).toBe(false);
  });

  it('never matches a macOS path with a Windows path', () => {
    expect(samePath('/Volumes/Photo/a.jpg', 'D:\\Photo\\a.jpg', 'win32')).toBe(false);
  });

  it('normalizes UNC paths on Windows', () => {
    expect(pathKey('\\\\NAS\\Photos\\A.jpg', 'win32')).toBe('\\\\nas\\photos\\a.jpg');
  });
});

describe('fileNameOf', () => {
  it.each([
    ['/Volumes/Photo/2013/0095.jpg', '0095.jpg'],
    ['C:\\Users\\Alice\\Pictures\\beach.HEIC', 'beach.HEIC'],
    ['D:/Photo/x.jpg', 'x.jpg'],
    ['\\\\nas\\share\\img.png', 'img.png'],
    ['/Users/a/back\\slash.jpg', 'back\\slash.jpg'],
    ['plain.jpg', 'plain.jpg'],
  ])('%s -> %s', (path, expected) => {
    expect(fileNameOf(path)).toBe(expected);
  });
});

describe('modKey', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere', () => {
    expect(modKey('darwin')).toBe('⌘');
    expect(modKey('win32')).toBe('Ctrl');
    expect(modKey('linux')).toBe('Ctrl');
  });
});
