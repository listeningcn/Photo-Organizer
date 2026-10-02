import type { Platform } from './paths';
import type { PhotoDetails } from './photo-details';

export interface PhotoDto {
  id: number;
  path: string;
  takenAt: number | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
  camera: string | null;
  width: number | null;
  height: number | null;
  missing: boolean;
  hiddenAt: number | null;
  mediaType: MediaType;
  /** Video length in seconds; null for photos. */
  duration: number | null;
}

export type MediaType = 'photo' | 'video';

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

export interface ImportProgress {
  folder: string;
  /** Total number of supported files found in the folder (0 while discovering). */
  total: number;
  scanned: number;
  /** Files already in the library with the same path, size and modified time; not re-read. */
  unchanged: number;
  imported: number;
  duplicates: number;
  relinked: number;
  failed: number;
  done: boolean;
  cancelled: boolean;
  /** The folder (e.g. an external drive) wasn't reachable, so it was skipped. */
  unavailable: boolean;
}

export interface PhotoApi {
  /** OS the app runs on, e.g. for shortcut labels. */
  readonly platform: Platform;
  /** Stops tracking a folder; its photos stay in the library. Originals are untouched. */
  removeFolder(path: string): Promise<void>;
  /** UI preferences, stored in the encrypted database. */
  getPreference(key: PreferenceKey): Promise<string | null>;
  setPreference(key: PreferenceKey, value: string): Promise<void>;
  status(): Promise<VaultStatus>;
  setup(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): Promise<void>;
  addFolder(): Promise<ImportProgress | null>;
  rescan(): Promise<void>;
  cancelImport(): Promise<void>;
  listFolders(): Promise<string[]>;
  listPhotos(): Promise<PhotoDto[]>;
  hiddenCount(): Promise<number>;
  /** True while hidden photos can be accessed without the password (10 min after entering it). */
  hideAuthorized(): Promise<boolean>;
  /** Lists hidden photos; password may be null within the grace period. */
  listHidden(password: string | null): Promise<PhotoDto[]>;
  hidePhoto(id: number, password: string | null): Promise<void>;
  restorePhoto(id: number): Promise<void>;
  /** Reads EXIF details from the original file on demand. */
  photoDetails(id: number): Promise<PhotoDetails>;
  /** Custom event/trip titles by event key. */
  getEventTitles(): Promise<Record<string, string>>;
  /** Sets a custom title; an empty title restores the automatic one. */
  setEventTitle(key: string, title: string): Promise<void>;
  onImportProgress(callback: (progress: ImportProgress) => void): () => void;
  /** Fires when main locks the library on its own (screen lock, sleep). */
  onLocked(callback: () => void): () => void;
}

export const PREFERENCE_KEYS = [
  'timeline.tileSize',
  'timeline.groupBy',
  /** `"lat,lng"`, used to tell trips from events at home. */
  'events.home',
  'events.gapHours',
  /** Minimum distance from home, in km, for an event to count as a trip. */
  'events.tripKm',
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export const MIN_PASSWORD_LENGTH = 8;
