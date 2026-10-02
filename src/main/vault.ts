import argon2 from 'argon2';
import { app } from 'electron';
import { hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIN_PASSWORD_LENGTH, type VaultStatus } from '@shared/api';

import { type Db, openDatabase, WrongKeyError } from './db';

interface Session {
  db: Db;
  masterKey: Buffer;
  blobKey: Buffer;
}

interface VaultFile {
  version: 1;
  salt: string;
}

let session: Session | null = null;
let failedAttempts = 0;

export const dataDir = () => app.getPath('userData');
const vaultFile = () => join(dataDir(), 'vault.json');
const dbFile = () => join(dataDir(), 'library.db');

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    raw: true,
    salt,
    hashLength: 32,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 1,
  });
}

function startSession(db: Db, masterKey: Buffer) {
  const blobKey = Buffer.from(hkdfSync('sha256', masterKey, '', 'blob-encryption', 32));
  session = { db, masterKey, blobKey };
}

export function getStatus(): VaultStatus {
  return { initialized: existsSync(vaultFile()), unlocked: session !== null };
}

export async function setupVault(password: string) {
  if (existsSync(vaultFile())) {
    throw new Error('Library already exists');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const db = openDatabase(dbFile(), key);
  const vault: VaultFile = { version: 1, salt: salt.toString('base64') };
  writeFileSync(vaultFile(), JSON.stringify(vault), { mode: 0o600 });
  startSession(db, key);
}

export async function unlockVault(password: string) {
  if (session) return;
  // Slows down repeated guessing on top of argon2's cost.
  if (failedAttempts > 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(failedAttempts, 10) * 500)
    );
  }
  const vault: VaultFile = JSON.parse(readFileSync(vaultFile(), 'utf8'));
  const key = await deriveKey(password, Buffer.from(vault.salt, 'base64'));
  try {
    startSession(openDatabase(dbFile(), key), key);
    failedAttempts = 0;
  } catch (error) {
    if (!(error instanceof WrongKeyError)) throw error;
    failedAttempts += 1;
    throw new Error('Wrong password');
  }
}

export function lockVault() {
  if (!session) return;
  try {
    // Fold the WAL back into library.db so no -wal/-shm files are left behind.
    session.db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // A checkpoint can fail if the DB is busy; close() still leaves it consistent.
  }
  session.db.close();
  session.masterKey.fill(0);
  session.blobKey.fill(0);
  session = null;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const { masterKey } = requireSession();
  const vault: VaultFile = JSON.parse(readFileSync(vaultFile(), 'utf8'));
  const key = await deriveKey(password, Buffer.from(vault.salt, 'base64'));
  return timingSafeEqual(key, masterKey);
}

export function requireSession(): Session {
  if (!session) {
    throw new Error('Library is locked');
  }
  return session;
}
