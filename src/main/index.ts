import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  powerMonitor,
  session,
} from 'electron';
import { join } from 'node:path';

import { registerIpc, stopImportAndLock } from './ipc';
import { logError, logInfo } from './logger';
import { APP_SCHEME, registerAppProtocol, registerAppSchemePrivileges } from './protocol';
import { applySessionSecurity } from './security';
import { getStatus, lockVault } from './vault';

const devServerUrl = process.env.ELECTRON_RENDERER_URL;

// Pin the data folder so dev and packaged builds share one library, regardless of the
// product name. PHOTO_ORGANIZER_DATA_DIR overrides it (e.g. for a test library).
app.setPath(
  'userData',
  process.env.PHOTO_ORGANIZER_DATA_DIR || join(app.getPath('appData'), 'photo-organizer')
);

process.on('uncaughtException', (error) => logError('uncaught exception', error));
process.on('unhandledRejection', (reason) => logError('unhandled rejection', reason));

// Two instances would open the same encrypted database at once.
if (!app.requestSingleInstanceLock()) {
  // Another copy (e.g. a dev instance left running after Ctrl+C) owns the library.
  // It is focused instead; say so, otherwise this exit looks like a crash.
  process.stderr.write(
    'Photo Organizer is already running; focusing the existing window and exiting.\n'
  );
  app.quit();
}

// In dev, Electron must not outlive `npm run dev`: an orphaned instance keeps the
// single-instance lock, so every later `npm run dev` would exit straight away.
if (devServerUrl) {
  const parent = process.ppid;
  setInterval(() => {
    try {
      process.kill(parent, 0); // Throws once the dev server process is gone.
    } catch {
      app.quit();
    }
  }, 2000).unref();
}

registerAppSchemePrivileges();
app.enableSandbox();

let mainWindow: BrowserWindow | null = null;

/**
 * In-memory session (no `persist:` prefix): Chromium writes no HTTP cache, cookies or
 * local storage to disk. Otherwise cached map tiles would reveal where photos were taken.
 */
const appSession = () => session.fromPartition('photo-organizer', { cache: false });

function isInternalUrl(url: string): boolean {
  if (devServerUrl && url.startsWith(devServerUrl)) return true;
  return url.startsWith('file://') || url.startsWith(`${APP_SCHEME}://`);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Photo Organizer',
    backgroundColor: '#1f1f1f',
    webPreferences: {
      session: appSession(),
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: Boolean(devServerUrl),
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    logError(`renderer gone: ${details.reason} (exit ${details.exitCode})`);
  });
  // Pinch-zoom would scale the whole UI; the timeline has its own zoom.
  window.webContents.setVisualZoomLevelLimits(1, 1);

  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  mainWindow = window;
}

/**
 * Standard macOS menu without the View > Zoom items, so ⌘+ / ⌘− / ⌘0 reach the
 * timeline's thumbnail zoom instead of scaling the whole window.
 */
function buildMenu() {
  const view: MenuItemConstructorOptions[] = [{ role: 'togglefullscreen' }];
  if (devServerUrl) {
    view.unshift({ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' });
  }
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          { role: 'appMenu' },
          { role: 'editMenu' },
          { label: 'View', submenu: view },
          { role: 'windowMenu' },
        ]
      : [
          { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
          { role: 'editMenu' },
          { label: 'View', submenu: view },
          { role: 'windowMenu' },
        ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Locks on the main side and tells the renderer to show the unlock screen. */
async function lockFromSystem(reason: string) {
  if (!getStatus().unlocked) return;
  await stopImportAndLock();
  logInfo(`locked: ${reason}`);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('vault:locked');
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(() => {
  // Packaged builds get the icon from the app bundle; in dev, set it explicitly.
  if (devServerUrl && process.platform === 'darwin') {
    app.dock?.setIcon(join(__dirname, '../../build/icon.png'));
  }
  applySessionSecurity(appSession(), devServerUrl);
  registerAppProtocol(appSession());
  registerIpc();
  buildMenu();
  createWindow();

  // Never leave the library unlocked when the user steps away.
  powerMonitor.on('lock-screen', () => void lockFromSystem('screen locked'));
  powerMonitor.on('suspend', () => void lockFromSystem('system sleep'));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Closing the window quits the app on every platform (also macOS), so nothing keeps
// running in the background with the library open.
app.on('window-all-closed', () => app.quit());

/** Longest we wait for an import to stop before closing the database anyway. */
const QUIT_TIMEOUT_MS = 5000;

// Stop imports and image workers, then close the database (checkpointing the WAL) before
// the process exits.
let quitting = false;
let cleanedUp = false;
app.on('before-quit', (event) => {
  if (cleanedUp) return;
  event.preventDefault();
  if (quitting) return; // Already shutting down; ignore repeated Quit.
  quitting = true;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, QUIT_TIMEOUT_MS));
  Promise.race([stopImportAndLock(), timeout])
    .catch((error) => logError('lock on quit failed', error))
    .finally(() => {
      lockVault(); // No-op if already closed; guarantees the DB is closed after a timeout.
      cleanedUp = true;
      logInfo('quit: library closed');
      app.quit();
    });
});

// Last resort for paths that skip before-quit (e.g. app.exit()).
app.on('will-quit', () => lockVault());

// Ctrl+C / kill / logout in a packaged app: shut down through the same path.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => app.quit());
}
