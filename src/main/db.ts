import Database from 'better-sqlite3-multiple-ciphers';
import { chmodSync } from 'node:fs';

import { runMigrations } from './migrations';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  folder_id INTEGER REFERENCES folders(id),
  taken_at INTEGER,
  year INTEGER,
  month INTEGER,
  lat REAL,
  lng REAL,
  place TEXT,
  camera TEXT,
  width INTEGER,
  height INTEGER,
  missing INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_year_month ON photos(year, month);
CREATE INDEX IF NOT EXISTS idx_photos_geo ON photos(lat, lng);
CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);
CREATE INDEX IF NOT EXISTS idx_photos_path ON photos(path);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  photo_id INTEGER,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Thrown when the database can't be decrypted with the given key. */
export class WrongKeyError extends Error {
  constructor() {
    super('Wrong password');
  }
}

/** Opens the SQLCipher database and applies pending migrations. */
export function openDatabase(file: string, key: Buffer): Db {
  const db = new Database(file);
  try {
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`key="x'${key.toString('hex')}'"`);
    try {
      // Reading the schema is the first operation that fails on a wrong key.
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch {
      throw new WrongKeyError();
    }
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.exec(SCHEMA);
    runMigrations(db);
  } catch (error) {
    db.close();
    throw error;
  }
  chmodSync(file, 0o600);
  return db;
}

export function audit(db: Db, action: string, photoId: number | null, detail?: string) {
  db.prepare(
    'INSERT INTO audit_log (at, action, photo_id, detail) VALUES (?, ?, ?, ?)'
  ).run(Date.now(), action, photoId, detail ?? null);
}

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}
