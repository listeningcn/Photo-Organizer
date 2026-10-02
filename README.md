# Photo Organizer

An offline-first, encrypted desktop photo organizer for macOS, built with Electron, React and Mantine.

Photo Organizer **indexes** your existing photo folders. It never moves, renames, modifies or uploads your original photos. Everything it creates (thumbnails, previews, the library database) is encrypted on your Mac and unlocked with your password.

## Contents

- [Features](#features)
- [How your photos are stored](#how-your-photos-are-stored)
- [Where your data lives](#where-your-data-lives)
- [Security and privacy](#security-and-privacy)
- [Backup, moving and resetting](#backup-moving-and-resetting)
- [Install](#install)
- [Development](#development)
- [Releasing](#releasing)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- **Import folders:** JPEG, PNG, WebP, GIF, TIFF, HEIC/HEIF and RAW (CR2, CR3, NEF, ARW, DNG, ORF, RW2, RAF). Images are processed in parallel worker threads, with a progress bar and a **Stop** button.
- **Nested folders are scanned once:** adding a subfolder of a tracked folder just rescans that part under the existing entry; adding a parent of tracked folders merges them into it. **Rescan** only walks top-level folders.
- **Trips & events:** photos are grouped automatically into events by time gaps (default 8 h, adjustable). With a home location set (click the map or use the most common location in **Settings**), events farther than a distance you choose (0–100 km, default 50) become **trips**, and multi-day trips stay together across nights. Each trip shows a route map, a day-by-day breakdown and a title you can rename. Everything is computed locally; home and titles are stored in the encrypted library.
- **Filter:** show All / Photos / Videos and pick formats (JPG, PNG, HEIC, a RAW format, MOV, MP4, ...) with counts. The filter applies to Timeline, Trips & events and Map.
- **Videos:** MP4, M4V, MOV, WebM, MKV, AVI, 3GP, MTS/M2TS. A still frame becomes the encrypted thumbnail/preview; capture date, GPS location (e.g. iPhone videos) and duration are read with a bundled ffprobe. Videos show a play badge with their length and play in the viewer (MP4/MOV/WebM with codecs Chromium supports, such as H.264, HEVC where the OS supports it, VP9 and AV1). Other formats show the still frame.
- **Fast rescans:** files whose path, size and modified time haven't changed are skipped without being read.
- **Duplicate and move detection:** files are identified by SHA-256. Identical copies count as duplicates, moved or renamed files are relinked, and deleted files are flagged as missing.
- **Timeline:** grouped by month or year, with sticky headers and a floating date label while scrolling.
- **Zoom:** ⌘/Ctrl + scroll wheel, ⌘/Ctrl + `+` / `−` / `0`, or the zoom slider (32–400 px thumbnails).
- **Map:** photos with GPS data appear as clustered thumbnails on OpenStreetMap. The Map tab is hidden when map tiles can't be loaded.
- **Photo viewer:** full EXIF details (camera, lens, exposure, location, file info) and a mini map.
- **Hidden photos:** hiding requires your password. Hidden photos are removed from Timeline, Trips and Map and can be restored from **Settings → Hidden photos**.
- **Auto-lock:** after 10 minutes without input (paused while an import runs), when the screen locks, when the Mac sleeps, when the window closes, and on quit.

## How your photos are stored

**The library does not contain copies of your original photos.** It contains an index plus small encrypted images made from them.

| Data                                                    | Stored where                                  | Needs the original folder? |
| ------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| Thumbnails (360 px, shown in Timeline and Map)          | Encrypted files in the data folder            | No                         |
| Previews (up to 2048 px, shown in the viewer)           | Encrypted files in the data folder            | No                         |
| Date taken, GPS, camera, dimensions, path, hidden state | Encrypted database                            | No                         |
| Full EXIF details in the viewer (lens, exposure, ...)   | Read from the original each time, never saved | **Yes**                    |
| Full-resolution original                                | Only in your original folder                  | **Yes**                    |

What this means in practice:

- **Browsing works without the originals.** If an external drive is unplugged, Timeline, Map and the viewer still work using thumbnails and previews. The viewer's details panel shows only what's in the database.
- **Keep your original folders.** The library isn't a backup. If the originals are deleted, you keep only the 2048 px previews.
- **Moving photos:** move or rename files freely, then click **Rescan**. They're matched by content hash and relinked.
- **Unplugged drives are safe to rescan.** A folder that can't be reached is skipped with a warning, and its photos are _not_ marked missing.
- **Photos deleted from disk** are marked _Missing_ after the next rescan. Their thumbnails and previews remain.

Rough storage cost: about 0.3–0.6 MB per photo for thumbnail + preview, so a 50,000-photo library uses roughly 15–30 GB.

## Where your data lives

Everything is in one folder:

- **macOS:** `~/Library/Application Support/photo-organizer/`
- **Windows:** `%APPDATA%\photo-organizer\` (usually `C:\Users\<you>\AppData\Roaming\photo-organizer\`)

```
photo-organizer/
├── vault.json      Password salt (not secret; useless without your password)
├── library.db      Encrypted SQLCipher database (photo index, folders, settings, audit log)
├── library.db-wal  Database write-ahead log (also encrypted)
├── blobs/          Encrypted thumbnails and previews; file names are HMACs, so they reveal nothing
└── logs/main.log   Local error log; file paths are redacted, nothing is sent anywhere
```

Development (`npm run dev`) and the packaged app use **the same folder**. To use a separate library (for testing, or to keep it on another disk), start the app with `PHOTO_ORGANIZER_DATA_DIR` set:

```sh
PHOTO_ORGANIZER_DATA_DIR=/Volumes/Secure/PhotoLibrary npm run dev
```

On macOS, files and folders are created with owner-only permissions (`0600` / `0700`). On Windows, `%APPDATA%` is already private to your user account.

## Security and privacy

| What                    | How                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password                | Argon2id key derivation (64 MiB, 3 iterations). Repeated wrong attempts are slowed down.                                                                                                                                                                       |
| Database                | SQLCipher (`better-sqlite3-multiple-ciphers`), keyed from your password                                                                                                                                                                                        |
| Thumbnails and previews | AES-256-GCM with a key derived via HKDF; stored under HMAC-derived file names                                                                                                                                                                                  |
| Original photos         | Opened read-only. Never written, moved or served to the UI.                                                                                                                                                                                                    |
| Original videos         | Opened read-only. For playback, `app://video/<id>` streams the original (looked up by id, only while unlocked); nothing is copied or transcoded to disk. ffmpeg/ffprobe run locally with only the `file` protocol allowed and frames are piped, never written. |
| Network                 | Deny-by-default (`src/shared/network.ts`). Only local resources and OpenStreetMap tile images are allowed. No analytics, telemetry, crash reporting or remote fonts.                                                                                           |
| Browser cache           | The UI runs in an in-memory session: map tiles, cookies and storage are never written to disk. UI preferences live in the encrypted database.                                                                                                                  |
| Renderer                | Sandboxed, context isolation, no Node integration, strict CSP, navigation/new windows/webviews blocked, all permission requests denied, DevTools disabled in packaged builds                                                                                   |
| IPC                     | Every call's arguments are validated in the main process; anything touching the library requires it to be unlocked                                                                                                                                             |
| Single instance         | A second copy of the app focuses the first instead of opening the database twice                                                                                                                                                                               |

**What OpenStreetMap can see:** your IP address and which map tiles you load (that is, roughly which areas you look at). Your photos and their metadata never leave your Mac. If you're offline, the Map tab is hidden and everything else works.

> **There is no password recovery.** If you forget your password, the library can't be decrypted. Your original photos are unaffected and can be imported again into a new library.

## Backup, moving and resetting

- **Back up:** quit the app, then copy the whole `photo-organizer` data folder. The copy stays encrypted. Time Machine works too; the database is consistent whenever the app is quit or locked.
- **Move to a new Mac:** see [Moving to another Mac](#moving-to-another-mac).
- **Reset (start over):** quit the app and delete the data folder. This permanently deletes the library index, thumbnails and hidden state. Originals are not touched.

### Moving to another Mac

You can move the whole library, database included, and keep using it on the new Mac **without a rescan**. Nothing is tied to the old machine: the encryption keys come from your password plus the salt in `vault.json`, so the same password unlocks the library anywhere.

#### What to copy

Copy the **entire** data folder. Its files only work together, because the database refers to the encrypted images and both use keys made from `vault.json`.

| Item                               | Required   | Notes                                                                     |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `vault.json`                       | Yes        | Without it, the library can't be unlocked, even with the right password   |
| `library.db`                       | Yes        | The index, folders, hidden state and audit log                            |
| `library.db-wal`, `library.db-shm` | If present | Normally absent once the app has quit. Copy them if they exist.           |
| `blobs/`                           | Yes        | Encrypted thumbnails and previews. Without it, the library has no images. |
| `logs/`                            | No         | Local error log only                                                      |

#### Steps

1. **On the old Mac, quit Photo Organizer** (⌘Q or close the window; both quit the app). Quitting stops any import and closes the database cleanly.
2. **Copy the data folder** to an external drive. Use `ditto`, which keeps file permissions and metadata:
   ```sh
   ditto ~/Library/Application\ Support/photo-organizer /Volumes/Transfer/photo-organizer
   ```
   The copy is encrypted, so it's safe on an unencrypted drive. Losing it reveals nothing without your password.
3. **Install Photo Organizer on the new Mac**, the same version or newer. Older versions refuse to open a library upgraded by a newer one. **Don't open it yet.** If you already did and created a new library, quit and delete that data folder first.
4. **Copy the folder into place** on the new Mac:
   ```sh
   ditto /Volumes/Transfer/photo-organizer ~/Library/Application\ Support/photo-organizer
   ```
5. **Make the originals available at the same paths as before** (see below).
6. **Open Photo Organizer and unlock with your existing password.** Timeline, Map, Hidden, preferences and the viewer all work immediately. No rescan is needed.

#### Original photo paths

The library records each original's **absolute path**, such as `/Volumes/Photo/2013/0095.jpg` or `/Users/alice/Pictures/beach.jpg`. With no rescan, those paths must be the same on the new Mac. Check them in **Settings → Folders**.

- **External drive:** plug in the same drive, or a copy with the **same volume name** (`/Volumes/Photo`). Paths match automatically.
- **Folders in your home folder:** use the **same macOS user name** on the new Mac (`/Users/alice/...`) and copy the folders to the same place.
- **Different locations:** you'll need a rescan after all; see the next section.

If the originals aren't available, the library **still works**. You can browse with thumbnails and previews, and the viewer shows the details stored in the database. Only the viewer's extra EXIF details (lens, exposure, ...) need the originals. Without a rescan, nothing is marked _Missing_.

#### If the original paths changed

Use **Add folder** to add each folder at its new location. Photos are matched by content hash and **relinked**, so hidden state and dates are kept and nothing is duplicated. This reads and hashes every file once, so it takes about as long as the first import. Thumbnails and previews are reused, not regenerated. Afterwards, remove the old entries in **Settings → Folders** (the folder-minus button). This only stops tracking them; photos and originals are untouched.

### Moving between Mac and Windows

The data folder is portable between macOS and Windows: copy it as described above (on Windows, to `%APPDATA%\photo-organizer`) and unlock with the same password. Paths always differ between the two systems (`/Volumes/Photo` vs `D:\Photo`), so afterwards use **Add folder** at the new location to relink, then remove the old folder entries. Until then, browsing with thumbnails and previews works.

On Windows, paths are matched case-insensitively, so `D:\Photo` and `d:\photo` are the same folder.

#### Moving to a different location on the same Mac

To keep the library somewhere other than `~/Library/Application Support/photo-organizer` (for example an encrypted external disk), copy the folder there and start the app with `PHOTO_ORGANIZER_DATA_DIR` set. See [Where your data lives](#where-your-data-lives).

## Install

**macOS:** download the `.dmg` for your Mac (`arm64` for Apple silicon, `x64` for Intel), open it and drag **Photo Organizer** to Applications. Requires macOS 12 or later.

**Windows:** run the `Setup` `.exe` (`x64` or `arm64`). Requires Windows 10 or later. Unsigned builds trigger a SmartScreen warning (**More info → Run anyway**). Uninstalling keeps your library in `%APPDATA%\photo-organizer`.

Shortcuts use ⌘ on macOS and Ctrl on Windows.

On first launch you'll create a password (at least 8 characters). Then use **Add folder** to import photos.

## Development

Requirements: macOS or Windows, Node.js 22 or later. Native modules (sharp, argon2, SQLCipher) are built for the current OS, so build Windows installers on Windows (`npm run dist:win`) and Mac builds on a Mac (`npm run dist`). Windows signing uses `CSC_LINK` / `CSC_KEY_PASSWORD`.

```sh
npm install      # also rebuilds native modules for Electron
npm run dev      # start with hot reload
```

If `npm run dev` fails with `Error: Electron uninstall`, the Electron binary was not downloaded during `npm install` (the download can be skipped or blocked by the network). Download it manually, then run `npm run dev` again:

```sh
node node_modules/electron/install.js
```

Changes to `src/main` or `src/preload` need a full restart of `npm run dev`; hot reload only covers the UI.

| Command                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Run in development mode                                          |
| `npm run build`         | Build main, preload, image worker and renderer into `out/`       |
| `npm start`             | Run the production build locally                                 |
| `npm run check`         | Typecheck, lint and test                                         |
| `npm run typecheck`     | TypeScript check                                                 |
| `npm run lint`          | ESLint                                                           |
| `npm test`              | Unit tests (Vitest)                                              |
| `npm run dist`          | Check, build and package a signed `.dmg` and `.zip` into `dist/` |
| `npm run dist:unsigned` | Package without code signing (local testing only)                |

### Database changes

Schema changes go in `src/main/migrations.ts` as a new entry at the end of `MIGRATIONS`. Never edit or reorder released migrations. The version is stored in `PRAGMA user_version`, and the app refuses to open a library created by a newer version.

## Releasing

1. Bump `version` in `package.json`.
2. Set signing and notarization credentials (requires an Apple Developer account):
   ```sh
   export CSC_NAME="Developer ID Application: Your Name (TEAMID)"   # or CSC_LINK + CSC_KEY_PASSWORD
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="TEAMID"
   ```
3. Run `npm run dist`. electron-builder signs with the hardened runtime (`build/entitlements.mac.plist`) and notarizes when the Apple variables are set.
4. Builds are for the current architecture. Build Intel (`x64`) and Apple silicon (`arm64`) on matching machines or CI runners, so native modules (sharp, SQLCipher, argon2) match.
5. Test the `.dmg` on a clean Mac: install, create a library, import HEIC/RAW/JPEG and a few videos (iPhone MOV, MP4), play one, lock/unlock, rescan with a drive unplugged, quit during an import.

Without signing and notarization, macOS Gatekeeper blocks the app on other Macs. `npm run dist:unsigned` is only for testing on your own machine.

The app has no auto-updater. Users install new versions by downloading the new `.dmg`. Existing libraries are migrated automatically on first unlock.

## Project structure

```
build/                    Icon (icon.svg source, icon.png) and macOS entitlements
src/
  main/                   Electron main process
    index.ts              App lifecycle, window, menu, auto-lock on sleep/screen lock
    ipc.ts                IPC handlers (validated, session-checked)
    vault.ts              Password, key derivation, lock/unlock
    db.ts                 Encrypted SQLite database
    migrations.ts         Versioned schema migrations
    crypto.ts             AES-256-GCM helpers
    blobs.ts              Encrypted thumbnail/preview storage
    importer.ts           Folder scanning, hashing, dedupe, skip-unchanged
    image-pool.ts         Worker-thread pool for image rendering
    image-worker.ts       Worker entry: decodes HEIC/RAW, renders thumbnails/previews
    image-processing.ts   Decoding and resizing (sharp, heic-convert, exifr)
    video.ts              Bundled ffprobe/ffmpeg: video metadata and still frames
    video-meta.ts         Parses ffprobe output (date, ISO 6709 location, duration)
    http-range.ts         Range requests for video playback
    import-rules.ts       Supported formats, duplicate/relink/unchanged rules
    photo-details.ts      On-demand EXIF details for the viewer
    protocol.ts           app:// protocol serving decrypted images
    security.ts           Network filter, headers, permissions
    logger.ts             Local error log with redacted paths
  preload/                Typed API exposed to the renderer (window.api)
  renderer/               React UI (Mantine)
  shared/                 Code shared between processes (API types, grouping, network policy,
                          formatting, path redaction), each with a *.spec.ts
```

## Troubleshooting

- **"Wrong password"**: passwords are case-sensitive. Repeated failures add a short delay.
- **"Created by a newer version"**: update the app. Older versions can't open libraries upgraded by newer ones.
- **Map tab missing**: map tiles couldn't be loaded (offline, or OpenStreetMap unreachable). It reappears when the connection returns.
- **Photos show "Missing"**: the original was moved or deleted. Click **Rescan** after reconnecting the drive or adding the new folder.
- **Some files failed to import**: see `logs/main.log` in the data folder. Corrupt files and RAW files without an embedded preview can't be imported.
- **The app locked by itself**: expected after 10 idle minutes, on screen lock or sleep.

## Tech stack

Electron · electron-vite · React 18 · Mantine 8 · Tabler Icons · Leaflet + markercluster · sharp · heic-convert · exifr · ffmpeg-static / ffprobe-static · Argon2 · SQLCipher · Vitest
