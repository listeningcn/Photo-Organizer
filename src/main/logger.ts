import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describeError, redactPaths } from '@shared/redact';

const MAX_LOG_BYTES = 1024 * 1024;

const logDir = () => join(app.getPath('userData'), 'logs');
export const logFile = () => join(logDir(), 'main.log');

/**
 * Appends a line to the local error log. File paths are redacted so the log never
 * contains photo names or locations. Nothing is ever sent anywhere.
 */
function write(level: 'error' | 'warn' | 'info', message: string, error?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${redactPaths(message)}${
    error === undefined ? '' : `\n  ${describeError(error).replace(/\n/g, '\n  ')}`
  }\n`;
  try {
    mkdirSync(logDir(), { recursive: true, mode: 0o700 });
    const file = logFile();
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, `${file}.1`);
    }
    appendFileSync(file, line, { mode: 0o600 });
  } catch {
    // Logging must never crash the app.
  }
}

export const logError = (message: string, error?: unknown) => {
  console.error(message, error ?? '');
  write('error', message, error);
};

export const logWarn = (message: string, error?: unknown) => {
  console.warn(message, error ?? '');
  write('warn', message, error);
};

export const logInfo = (message: string) => write('info', message);
