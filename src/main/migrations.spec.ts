import {
  type MigratableDb,
  type Migration,
  MIGRATIONS,
  runMigrations,
} from './migrations';

/** In-memory stand-in for the parts of better-sqlite3 the runner uses. */
function fakeDb(userVersion = 0, columns: string[] = []) {
  const state = { userVersion, columns: new Set(columns), exec: [] as string[] };
  const db: MigratableDb = {
    pragma: ((source: string) => {
      const set = /^user_version = (\d+)$/.exec(source);
      if (set) {
        state.userVersion = Number(set[1]);
        return undefined;
      }
      return state.userVersion;
    }) as MigratableDb['pragma'],
    prepare: () => ({ all: () => [...state.columns].map((name) => ({ name })) }),
    exec: (sql: string) => {
      state.exec.push(sql);
      const added = /ADD COLUMN (\w+)/.exec(sql);
      if (added) state.columns.add(added[1]);
    },
    transaction: (fn) => fn,
  };
  return { db, state };
}

describe('runMigrations', () => {
  it('migrates a fresh library to the latest version', () => {
    const { db, state } = fakeDb();
    expect(runMigrations(db)).toBe(MIGRATIONS.at(-1)!.version);
    expect(state.columns).toEqual(
      new Set(['file_size', 'file_mtime', 'media_type', 'duration'])
    );
  });

  it('is idempotent for pre-versioning libraries that already have the columns', () => {
    const { db, state } = fakeDb(0, [
      'file_size',
      'file_mtime',
      'media_type',
      'duration',
    ]);
    runMigrations(db);
    expect(state.exec.filter((sql) => sql.includes('ALTER'))).toEqual([]);
    expect(state.userVersion).toBe(MIGRATIONS.at(-1)!.version);
  });

  it('skips migrations that were already applied', () => {
    const applied: number[] = [];
    const migrations: Migration[] = [1, 2, 3].map((version) => ({
      version,
      description: `v${version}`,
      up: () => applied.push(version),
    }));
    const { db, state } = fakeDb(2);
    expect(runMigrations(db, migrations)).toBe(3);
    expect(applied).toEqual([3]);
    expect(state.userVersion).toBe(3);
  });

  it('refuses a library from a newer app version', () => {
    const { db } = fakeDb(99);
    expect(() => runMigrations(db)).toThrow(/newer version/);
  });

  it('keeps migration versions strictly increasing', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});
