import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  type ImportProgress,
  type PhotoDto,
  PREFERENCE_KEYS,
  type PreferenceKey,
} from '@shared/api';
import { topLevelFolders } from '@shared/paths';

import { audit, getSetting, setSetting } from './db';
import { importFolder } from './importer';
import { readPhotoDetails } from './photo-details';
import {
  getStatus,
  lockVault,
  requireSession,
  setupVault,
  unlockVault,
  verifyPassword,
} from './vault';

interface PhotoRow {
  id: number;
  path: string;
  taken_at: number | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
  camera: string | null;
  width: number | null;
  height: number | null;
  missing: number;
  deleted_at: number | null;
  media_type: string;
  duration: number | null;
}

const toDto = (row: PhotoRow): PhotoDto => ({
  id: row.id,
  path: row.path,
  takenAt: row.taken_at,
  lat: row.lat,
  lng: row.lng,
  place: row.place,
  camera: row.camera,
  width: row.width,
  height: row.height,
  missing: row.missing === 1,
  hiddenAt: row.deleted_at,
  mediaType: row.media_type === 'video' ? 'video' : 'photo',
  duration: row.duration,
});

function assertPreferenceKey(value: unknown): asserts value is PreferenceKey {
  if (!(PREFERENCE_KEYS as readonly unknown[]).includes(value)) {
    throw new Error('Invalid argument');
  }
}

function assertString(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error('Invalid argument');
}

function assertId(value: unknown): asserts value is number {
  if (!Number.isInteger(value)) throw new Error('Invalid argument');
}

let importRunning = false;
let importController: AbortController | null = null;

async function runImport(event: IpcMainInvokeEvent, folder: string, signal: AbortSignal) {
  const send = (progress: ImportProgress) =>
    event.sender.send('import:progress', progress);
  return importFolder(folder, send, signal);
}

let importTask: Promise<unknown> | null = null;

/** Runs one import/rescan at a time and remembers it so locking can wait for it. */
async function exclusiveImport<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (importRunning) throw new Error('An import is already running');
  importRunning = true;
  importController = new AbortController();
  const task = run(importController.signal);
  importTask = task;
  try {
    return await task;
  } finally {
    importRunning = false;
    importController = null;
    importTask = null;
  }
}

/** Stops any running import before closing the database, so it never hits a closed connection. */
export async function stopImportAndLock() {
  importController?.abort();
  await importTask?.catch(() => undefined);
  lockVault();
}

export function registerIpc() {
  ipcMain.handle('vault:status', () => getStatus());

  ipcMain.handle('preferences:get', (_e, key: unknown) => {
    assertPreferenceKey(key);
    const { db } = requireSession();
    return getSetting(db, `pref:${key}`) ?? null;
  });

  ipcMain.handle('preferences:set', (_e, key: unknown, value: unknown) => {
    assertPreferenceKey(key);
    assertString(value);
    if (value.length > 100) throw new Error('Invalid argument');
    const { db } = requireSession();
    setSetting(db, `pref:${key}`, value);
  });

  ipcMain.handle('vault:setup', async (_e, password: unknown) => {
    assertString(password);
    await setupVault(password);
  });

  ipcMain.handle('vault:unlock', async (_e, password: unknown) => {
    assertString(password);
    await unlockVault(password);
  });

  ipcMain.handle('vault:lock', () => stopImportAndLock());

  ipcMain.handle('folders:add', async (event) => {
    requireSession();
    if (importRunning) throw new Error('An import is already running');
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Choose a photo folder',
      properties: ['openDirectory' as const],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return exclusiveImport((signal) => runImport(event, result.filePaths[0], signal));
  });

  ipcMain.handle('folders:rescan', async (event) => {
    const { db } = requireSession();
    await exclusiveImport(async (signal) => {
      const folders = db.prepare('SELECT path FROM folders ORDER BY id').all() as {
        path: string;
      }[];
      // A subfolder of another tracked folder is covered by its parent's scan.
      const roots = topLevelFolders(
        folders.map((row) => row.path),
        process.platform
      );
      for (const path of roots) {
        if (signal.aborted) break;
        await runImport(event, path, signal);
      }
    });
  });

  ipcMain.handle('import:cancel', () => {
    requireSession();
    importController?.abort();
  });

  ipcMain.handle('folders:list', () => {
    const { db } = requireSession();
    return (
      db.prepare('SELECT path FROM folders ORDER BY path').all() as { path: string }[]
    ).map((row) => row.path);
  });

  // Stops tracking a folder. Its photos stay in the library (browsable from thumbnails and
  // previews) but are no longer rescanned. Nothing on disk is touched.
  ipcMain.handle('folders:remove', (_e, path: unknown) => {
    assertString(path);
    const { db } = requireSession();
    if (importRunning) throw new Error('Wait for the import to finish first');
    const row = db.prepare('SELECT id FROM folders WHERE path = ?').get(path) as
      { id: number } | undefined;
    if (!row) throw new Error('Folder not found');
    db.transaction(() => {
      db.prepare('UPDATE photos SET folder_id = NULL WHERE folder_id = ?').run(row.id);
      db.prepare('DELETE FROM folders WHERE id = ?').run(row.id);
      audit(db, 'folder-remove', null);
    })();
  });

  ipcMain.handle('photos:list', (_e, hidden: unknown) => {
    const { db } = requireSession();
    const where = hidden === true ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
    const rows = db
      .prepare(`SELECT * FROM photos WHERE ${where} ORDER BY taken_at DESC`)
      .all() as PhotoRow[];
    return rows.map(toDto);
  });

  ipcMain.handle('photos:hide', async (_e, id: unknown, password: unknown) => {
    assertId(id);
    assertString(password);
    const { db } = requireSession();
    if (!(await verifyPassword(password))) {
      audit(db, 'hide-denied', id);
      throw new Error('Wrong password');
    }
    db.prepare(
      'UPDATE photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL'
    ).run(Date.now(), id);
    audit(db, 'hide', id);
  });

  ipcMain.handle('photos:restore', (_e, id: unknown) => {
    assertId(id);
    const { db } = requireSession();
    db.prepare('UPDATE photos SET deleted_at = NULL WHERE id = ?').run(id);
    audit(db, 'restore', id);
  });

  ipcMain.handle('events:titles', () => {
    const { db } = requireSession();
    const rows = db.prepare('SELECT event_key, title FROM event_titles').all() as {
      event_key: string;
      title: string;
    }[];
    return Object.fromEntries(rows.map((row) => [row.event_key, row.title]));
  });

  ipcMain.handle('events:setTitle', (_e, key: unknown, title: unknown) => {
    assertString(key);
    assertString(title);
    if (!/^\d{1,15}$/.test(key) || title.length > 100)
      throw new Error('Invalid argument');
    const { db } = requireSession();
    const trimmed = title.trim();
    if (trimmed) {
      db.prepare(
        'INSERT INTO event_titles (event_key, title) VALUES (?, ?) ON CONFLICT(event_key) DO UPDATE SET title = excluded.title'
      ).run(key, trimmed);
    } else {
      db.prepare('DELETE FROM event_titles WHERE event_key = ?').run(key);
    }
  });

  ipcMain.handle('photos:details', async (_e, id: unknown) => {
    assertId(id);
    const { db } = requireSession();
    const row = db.prepare('SELECT path FROM photos WHERE id = ?').get(id) as
      { path: string } | undefined;
    if (!row) throw new Error('Photo not found');
    return readPhotoDetails(row.path);
  });
}
