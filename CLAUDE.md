# Photo Organizer: instructions for AI assistants

Offline-first, encrypted photo organizer for macOS and Windows. Compare/key paths with `@shared/paths` (`samePath`, `pathKey`, `fileNameOf`), never `===` or `split('/')`; Windows paths are case-insensitive. Electron + electron-vite, React 18, Mantine 8, TypeScript. See `README.md` for features and structure.

## Hard rules

- **Never write to original photos or their folders.** The importer only reads source files. Videos are probed/framed by bundled ffmpeg (`src/main/video.ts`, piped output, `file` protocol only) and streamed read-only via `app://video/<id>`; never transcode or copy them to disk. All derived data (thumbnails, previews, DB) lives in Electron `userData`.
- **All derived data stays encrypted.** DB uses SQLCipher (`src/main/db.ts`); images use AES-256-GCM via `src/main/crypto.ts` / `src/main/blobs.ts`. Never store plaintext photo data or metadata on disk.
- **Network is deny-by-default.** Every request is filtered by `isRequestAllowed` in `src/shared/network.ts`. Only local protocols and OpenStreetMap tile images are allowed. Don't add hosts, analytics, CDNs or remote fonts without explicit approval. Update `buildCsp` and `network.spec.ts` alongside any change.
- **Keep the renderer locked down.** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The renderer talks to main only through `window.api` (`src/preload/index.ts`), typed by `PhotoApi` in `src/shared/api.ts`.
- **Validate IPC input in main.** Use `assertString` / `assertId` in `src/main/ipc.ts`; call `requireSession()` for anything that touches the library.

## Conventions

- New IPC call: add to `PhotoApi` (`src/shared/api.ts`) → preload → `ipcMain.handle` in `src/main/ipc.ts`.
- UI: use Mantine components and `@tabler/icons-react`; avoid hand-rolled buttons/inputs. Custom CSS goes in `src/renderer/src/styles.css`, using Mantine CSS variables where possible.
- Pure logic shared between processes goes in `src/shared/` with a `*.spec.ts` next to it.
- Imports use the `@shared/*` alias. Formatting is Prettier.
- Keep large-library performance in mind: image decoding/resizing runs in worker threads (`src/main/image-pool.ts`, `image-worker.ts`); never do CPU-heavy work on the main process. Timeline groups use `content-visibility`.
- Schema changes: append to `MIGRATIONS` in `src/main/migrations.ts`; never edit released ones.
- Don't use `localStorage`/IndexedDB: the UI session is in-memory. Persist UI preferences with `getPreference`/`setPreference` (encrypted DB).
- Log with `src/main/logger.ts`, never `console` + disk. Logs are path-redacted; don't log photo paths or metadata.

## Before finishing a change

```sh
npm run typecheck
npm run lint
npm test
```

Run `npx prettier --write` on changed files.
