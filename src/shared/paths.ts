/**
 * Cross-platform path helpers that work on paths from *any* OS, so a library created on
 * macOS can be read on Windows and vice versa.
 */

export type Platform = 'darwin' | 'win32' | 'linux' | (string & {});

const isWindowsPath = (path: string) =>
  /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');

/**
 * Key for comparing paths on the given platform. Windows paths are case-insensitive and
 * accept both separators. macOS volumes can be case-sensitive, so other platforms compare
 * paths exactly.
 */
export function pathKey(path: string, platform: Platform): string {
  if (platform !== 'win32') return path;
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function samePath(a: string, b: string, platform: Platform): boolean {
  return pathKey(a, platform) === pathKey(b, platform);
}

/** Folder key without a trailing separator; roots (`/`, `c:\`) keep theirs. */
function folderKey(path: string, platform: Platform): string {
  const sep = platform === 'win32' ? '\\' : '/';
  let key = pathKey(path, platform);
  if (/^[a-z]:$/i.test(key)) key += sep; // pathKey strips the `\` from `C:\`.
  if (key === sep || /^[a-z]:\\$/i.test(key)) return key;
  return key.endsWith(sep) ? key.slice(0, -1) : key;
}

/**
 * True when `path` is `folder` itself or anywhere inside it. Compares whole segments, so
 * `/Photos2` is not inside `/Photos`.
 */
export function isWithin(path: string, folder: string, platform: Platform): boolean {
  const sep = platform === 'win32' ? '\\' : '/';
  const child = folderKey(path, platform);
  const parent = folderKey(folder, platform);
  if (child === parent) return true;
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/**
 * Drops folders that are inside (or duplicates of) another folder in the list, so every
 * file is scanned exactly once. Keeps the order of the remaining folders.
 */
export function topLevelFolders(folders: string[], platform: Platform): string[] {
  return folders.filter(
    (folder, index) =>
      !folders.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          isWithin(folder, other, platform) &&
          // Of two identical entries, keep the first.
          (!samePath(folder, other, platform) || otherIndex < index)
      )
  );
}

/** Last path segment, for both `/` and `\` separated paths. */
export function fileNameOf(path: string): string {
  const separators = isWindowsPath(path) ? /[\\/]/ : /\//;
  const parts = path.split(separators).filter(Boolean);
  return parts.at(-1) ?? path;
}

/** Modifier key label for shortcuts: ⌘ on macOS, Ctrl elsewhere. */
export function modKey(platform: Platform): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl';
}
