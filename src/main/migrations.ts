/** Minimal database surface the migration runner needs, so it can be tested without SQLCipher. */
export interface MigratableDb {
  pragma(source: string, options: { simple: true }): unknown;
  pragma(source: string): unknown;
  prepare(sql: string): { all(): unknown[] };
  exec(sql: string): unknown;
  transaction(fn: () => void): () => void;
}

export interface Migration {
  version: number;
  description: string;
  up(db: MigratableDb): void;
}

function hasColumn(db: MigratableDb, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (row) => row.name === column
  );
}

/**
 * Ordered schema changes applied on top of the base schema. Append new entries; never edit
 * or reorder released ones. Steps must be idempotent because libraries created before
 * versioning may already contain some of these columns.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Record file size and mtime so rescans can skip unchanged files',
    up(db) {
      if (!hasColumn(db, 'photos', 'file_size')) {
        db.exec('ALTER TABLE photos ADD COLUMN file_size INTEGER');
      }
      if (!hasColumn(db, 'photos', 'file_mtime')) {
        db.exec('ALTER TABLE photos ADD COLUMN file_mtime INTEGER');
      }
    },
  },
  {
    version: 2,
    description: 'Videos: media type and duration',
    up(db) {
      if (!hasColumn(db, 'photos', 'media_type')) {
        db.exec("ALTER TABLE photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo'");
      }
      if (!hasColumn(db, 'photos', 'duration')) {
        db.exec('ALTER TABLE photos ADD COLUMN duration REAL');
      }
    },
  },
  {
    version: 3,
    description: 'Custom titles for automatic events and trips',
    up(db) {
      db.exec(
        'CREATE TABLE IF NOT EXISTS event_titles (event_key TEXT PRIMARY KEY, title TEXT NOT NULL)'
      );
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

/**
 * Applies pending migrations in a single transaction and records the result in
 * `PRAGMA user_version`. Refuses to open a library written by a newer app version.
 */
export function runMigrations(
  db: MigratableDb,
  migrations: Migration[] = MIGRATIONS
): number {
  const current = Number(db.pragma('user_version', { simple: true }) ?? 0);
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) {
    throw new Error(
      'This library was created by a newer version of Photo Organizer. Please update the app.'
    );
  }
  const pending = migrations.filter((migration) => migration.version > current);
  if (pending.length === 0) return current;

  db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  })();
  return latest;
}
